import { Logger } from '@nestjs/common';
import type {
  ModelGatewayReasoningEffort,
  ModelGatewayRequest,
} from '@/modules/modelGateway/model-gateway.types';
import {
  ANTHROPIC_MANUAL_BUDGETS,
  AnthropicEffort,
  AnthropicModelCapabilities,
  closestAnthropicEffortAtOrBelow,
  resolveAnthropicModelCapabilities,
} from './anthropic-model-capabilities';

/** 探针遇到能力表不支持的档位时抛出：内核把它当作「未生成此档位的推理控制参数」跳过，不发请求 */
export class AnthropicUnsupportedReasoningLevelError extends Error {
  constructor() {
    super('该 Claude 模型不支持这个推理档位');
    this.name = 'AnthropicUnsupportedReasoningLevelError';
  }
}

/** 默认输出上限：adaptive 家族开思考时 16384，手动思考时「预算 + 4096」，其余 4096 */
export const ANTHROPIC_DEFAULT_MAX_TOKENS = 4096;
export const ANTHROPIC_ADAPTIVE_DEFAULT_MAX_TOKENS = 16384;
const MANUAL_OUTPUT_RESERVE = 4096;
/** 预算至少 1024，且比上限至少少 1024；探针把上限提到「预算 + 1024」 */
const MIN_BUDGET = 1024;
const BUDGET_HEADROOM = 1024;

const WARN_CONTEXT = 'AnthropicMessagesAdapter';
const NOTE_OFF_UNSUPPORTED = '该 Claude 模型不能关闭思考，已按最低档发送';
const NOTE_LEVEL_DOWNGRADED = '该 Claude 模型不支持所选推理档位，已改用不高于它的最高可用档位';
const NOTE_SAMPLING_REMOVED = '该 Claude 模型不接受部分采样参数，已从请求中去掉';
const NOTE_BUDGET_DOES_NOT_FIT = '思考预算不足最低值（1024）或放不下输出上限，本次请求不开思考';
const NOTE_MANUAL_THINKING_WITHOUT_BLOCKS =
  '续接的工具调用前没有可回放的思考块，本次请求不开手动思考';

export interface AnthropicRequestControls {
  /** 附加参数去掉 thinking、output_config 与被剥掉的采样参数之后的其余字段 */
  params: Record<string, unknown>;
  thinking?: unknown;
  outputConfig?: unknown;
  maxTokens: number;
  temperature?: number;
  /** 「必须调用工具」能否发 any：家族拒绝强制工具、或最终是手动思考时不能 */
  forcedToolAllowed: boolean;
}

interface FamilyThinking {
  thinking?: Record<string, unknown>;
  effort?: AnthropicEffort;
  /** 平台按档位定的手动预算（只有它允许探针提高上限） */
  budget?: number;
}

/**
 * 按能力表一次决定最终参数，顺序固定、避免互相覆盖：
 * 1. 思考意图：disableThinking → off（优先于档位）；否则用入口解析好的 reasoningEffort；都没有时，探针（test_connection）
 *    对已知家族清除附加参数里的 thinking 与 output_config.effort，其他调用方保留管理员显式写的参数。
 * 2. 已知家族有意图时，平台意图覆盖附加参数里的 thinking 与 output_config.effort（output_config 其他字段保留）；
 *    未知模型只透传管理员的参数，遇到 off 时去掉 thinking 与 effort，不承诺能关。
 * 3. 按最终 thinking 类型处理输出上限与手动预算、采样参数、强制工具。
 * 探针里能力表不支持的档位抛 AnthropicUnsupportedReasoningLevelError（如实报告）；对话里降级并记静态警告。
 */
export function resolveAnthropicRequestControls(
  request: ModelGatewayRequest,
  additionalParams: Record<string, unknown>,
  options: {
    /**
     * 本次是在续接工具调用、而最后一条助手消息不以思考块开头时为 false：手动思考（enabled）要求
     * 续接时最后的助手回合以思考块开头，否则会被拒，这时本次改为关闭（新的用户消息开始新运行时不受影响）
     */
    manualThinkingAllowed?: boolean;
  } = {},
): AnthropicRequestControls {
  const capabilities = resolveAnthropicModelCapabilities(request.config.model);
  const probe = request.purpose === 'test_connection';
  const level: ModelGatewayReasoningEffort | undefined = request.disableThinking
    ? 'off'
    : request.config.reasoningEffort || undefined;
  const notes = new Set<string>();

  const {
    thinking: adminThinking,
    output_config: adminOutputConfig,
    ...params
  } = {
    ...additionalParams,
  };
  let thinking: unknown = adminThinking;
  let outputConfig: unknown = adminOutputConfig;
  let platformBudget: number | undefined;

  const replace = capabilities ? level !== undefined || probe : level === 'off';
  if (replace) {
    thinking = undefined;
    outputConfig = withoutEffort(outputConfig);
  }
  if (capabilities && level !== undefined) {
    const decided = decideFamilyThinking(capabilities, level, {
      probe,
      fromConfig: !request.disableThinking,
      notes,
    });
    thinking = decided.thinking;
    platformBudget = decided.budget;
    if (decided.effort)
      outputConfig = { ...(asRecord(outputConfig) || {}), effort: decided.effort };
  }

  if (options.manualThinkingAllowed === false && asRecord(thinking)?.type === 'enabled') {
    thinking = { type: 'disabled' };
    notes.add(NOTE_MANUAL_THINKING_WITHOUT_BLOCKS);
  }

  // 输出上限：调用方显式 > 附加参数 max_tokens > 默认值；显式上限是硬上限（探针为平台预算例外）
  const cap = positiveInteger(request.maxTokens) ?? positiveInteger(params.max_tokens);
  let maxTokens: number;
  const thinkingRecord = asRecord(thinking);
  if (capabilities && thinkingRecord?.type === 'enabled') {
    // 预算缺失、不是正整数（0、负数、小数、字符串）都按不足处理，不原样发出
    const budget = positiveInteger(thinkingRecord.budget_tokens) ?? 0;
    if (probe && platformBudget !== undefined) {
      maxTokens = budget + BUDGET_HEADROOM;
    } else {
      // 有上限时预算缩到「上限 − 1024」；不论有没有上限，预算都必须 ≥ 1024，否则本次不开思考
      const fitted = cap !== undefined ? Math.min(budget, cap - BUDGET_HEADROOM) : budget;
      if (fitted >= MIN_BUDGET) {
        thinking = { ...thinkingRecord, budget_tokens: fitted };
        maxTokens = cap ?? fitted + MANUAL_OUTPUT_RESERVE;
      } else {
        thinking = { type: 'disabled' };
        notes.add(NOTE_BUDGET_DOES_NOT_FIT);
        maxTokens = cap ?? ANTHROPIC_DEFAULT_MAX_TOKENS;
      }
    }
  } else if (capabilities?.thinking === 'adaptive' && thinksAdaptively(thinking, capabilities)) {
    maxTokens = cap ?? ANTHROPIC_ADAPTIVE_DEFAULT_MAX_TOKENS;
  } else {
    maxTokens = cap ?? ANTHROPIC_DEFAULT_MAX_TOKENS;
  }

  // 采样参数按最终 thinking 类型处理
  const finalType = asRecord(thinking)?.type;
  const thinkingOn = finalType === 'adaptive' || finalType === 'enabled';
  let temperature = request.temperature;
  const sampling = capabilities?.sampling;
  if (sampling === 'always' || (sampling === 'thinking' && thinkingOn)) {
    let removed = false;
    if (temperature !== undefined) {
      temperature = undefined;
      removed = true;
    }
    if ('top_k' in params) {
      delete params.top_k;
      removed = true;
    }
    if ('top_p' in params) {
      const value = params.top_p;
      // 4.6 及更早开思考时 top_p 只能在 [0.95, 1]；4.7 及以后一律不接受
      const keep =
        sampling === 'thinking' && typeof value === 'number' && value >= 0.95 && value <= 1;
      if (!keep) {
        delete params.top_p;
        removed = true;
      }
    }
    if (removed) notes.add(NOTE_SAMPLING_REMOVED);
  }

  if (!probe) notes.forEach(note => Logger.warn(note, WARN_CONTEXT));
  return {
    params,
    thinking,
    outputConfig,
    maxTokens,
    temperature,
    forcedToolAllowed: (capabilities?.forcedTool ?? true) && finalType !== 'enabled',
  };
}

function decideFamilyThinking(
  capabilities: AnthropicModelCapabilities,
  level: ModelGatewayReasoningEffort,
  context: { probe: boolean; fromConfig: boolean; notes: Set<string> },
): FamilyThinking {
  if (capabilities.thinking === 'none') return {};
  if (level === 'off') {
    if (capabilities.off === 'disabled') return { thinking: { type: 'disabled' } };
    if (capabilities.off === 'between_tools') return { thinking: { type: 'between_tools' } };
    // 不能关：探针如实报告（跳过）；对话里按最低档发（内部小任务的 disableThinking 本来就预期如此，不记警告）
    if (context.probe) throw new AnthropicUnsupportedReasoningLevelError();
    if (context.fromConfig) context.notes.add(NOTE_OFF_UNSUPPORTED);
    return { thinking: { type: 'adaptive' }, effort: capabilities.efforts[0] };
  }
  if (level === 'minimal' && context.probe) throw new AnthropicUnsupportedReasoningLevelError();

  if (capabilities.thinking === 'adaptive') {
    return {
      thinking: { type: 'adaptive' },
      effort: supportedEffort(capabilities.efforts, level, context),
    };
  }

  // 手动思考：支持 effort 的（Opus 4.5）按 effort 档定预算；其余 low / medium / 更高 → 三档预算
  let tier: keyof typeof ANTHROPIC_MANUAL_BUDGETS;
  let effort: AnthropicEffort | undefined;
  if (capabilities.efforts.length) {
    effort = supportedEffort(capabilities.efforts, level, context);
    tier = effort === 'low' || effort === 'medium' ? effort : 'high';
  } else {
    tier = level === 'minimal' || level === 'low' ? 'low' : level === 'medium' ? 'medium' : 'high';
    if (level === 'minimal') context.notes.add(NOTE_LEVEL_DOWNGRADED);
  }
  const budget = ANTHROPIC_MANUAL_BUDGETS[tier];
  return { thinking: { type: 'enabled', budget_tokens: budget }, effort, budget };
}

/** 能力表里有就用；没有时探针抛错，对话里降到不高于它的最高档（minimal 取最低档） */
function supportedEffort(
  efforts: AnthropicEffort[],
  level: ModelGatewayReasoningEffort,
  context: { probe: boolean; notes: Set<string> },
): AnthropicEffort {
  if ((efforts as string[]).includes(level)) return level as AnthropicEffort;
  if (context.probe) throw new AnthropicUnsupportedReasoningLevelError();
  context.notes.add(NOTE_LEVEL_DOWNGRADED);
  return closestAnthropicEffortAtOrBelow(level, efforts) as AnthropicEffort;
}

/** adaptive 家族这次会不会思考：显式 adaptive / between_tools，或不带 thinking 且家族默认思考 */
function thinksAdaptively(thinking: unknown, capabilities: AnthropicModelCapabilities): boolean {
  if (thinking === undefined) return capabilities.thinkingByDefault;
  const type = asRecord(thinking)?.type;
  return type === 'adaptive' || type === 'between_tools';
}

/** 去掉 output_config.effort，保留其他字段；不是对象时整个去掉 */
function withoutEffort(outputConfig: unknown): Record<string, unknown> | undefined {
  const record = asRecord(outputConfig);
  if (!record) return undefined;
  const { effort: _effort, ...rest } = record;
  return Object.keys(rest).length ? rest : undefined;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? { ...(value as Record<string, unknown>) }
    : undefined;
}

function positiveInteger(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : undefined;
}
