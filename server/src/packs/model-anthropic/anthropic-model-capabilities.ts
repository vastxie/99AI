import type { ModelGatewayReasoningEffort } from '@/modules/modelGateway/model-gateway.types';

/** Anthropic `output_config.effort` 的取值 */
export type AnthropicEffort = 'low' | 'medium' | 'high' | 'xhigh' | 'max';

export const ANTHROPIC_EFFORTS: AnthropicEffort[] = ['low', 'medium', 'high', 'xhigh', 'max'];

/**
 * 一个 Claude 家族的推理能力（静态、不联网；依据 platform.claude.com 文档复核结论）：
 * - thinking：adaptive 发 `thinking.type = adaptive` + `output_config.effort`；manual 只能 `enabled + budget_tokens`；
 *   none 不支持思考
 * - off：请求「关闭」时发什么：unsupported 不能关（`disabled` 会 400）；disabled；between_tools（Sonnet 5.5 最低档）
 * - efforts：接受的 effort 档位，空数组表示不发 effort
 * - sampling：always 任何时候都不接受非默认采样参数（4.7 及以后、5 系列）；thinking 只在开思考时受限
 *   （4.6 及更早）；none 不处理（3.5 / 3）
 * - forcedTool：是否接受强制工具（`tool_choice` any / tool）
 * - thinkingByDefault：请求不带 thinking 时是否默认思考（5 系列、Fable、Mythos 是；4.x 否）
 * - maxOutput：文档确认的最大输出，只作说明、不做硬上限；null 表示文档没有确认
 */
export interface AnthropicModelCapabilities {
  family: string;
  thinking: 'adaptive' | 'manual' | 'none';
  off: 'unsupported' | 'disabled' | 'between_tools';
  efforts: AnthropicEffort[];
  sampling: 'always' | 'thinking' | 'none';
  forcedTool: boolean;
  thinkingByDefault: boolean;
  maxOutput: number | null;
}

type FamilyEntry = Omit<AnthropicModelCapabilities, 'family'>;

const adaptive = (patch: Partial<FamilyEntry> = {}): FamilyEntry => ({
  thinking: 'adaptive',
  off: 'disabled',
  efforts: ANTHROPIC_EFFORTS,
  sampling: 'always',
  forcedTool: true,
  thinkingByDefault: true,
  maxOutput: 128000,
  ...patch,
});

const manual = (patch: Partial<FamilyEntry> = {}): FamilyEntry => ({
  thinking: 'manual',
  off: 'disabled',
  efforts: [],
  sampling: 'thinking',
  forcedTool: true,
  thinkingByDefault: false,
  maxOutput: null,
  ...patch,
});

const noThinking: FamilyEntry = {
  thinking: 'none',
  off: 'disabled',
  efforts: [],
  sampling: 'none',
  forcedTool: true,
  thinkingByDefault: false,
  maxOutput: null,
};

/** 家族表：键是解析后的规范 ID（见 resolveAnthropicModelCapabilities） */
const ANTHROPIC_FAMILIES: Record<string, FamilyEntry> = {
  'claude-opus-5-5': adaptive({ off: 'unsupported', forcedTool: false }),
  'claude-sonnet-5-5': adaptive({ off: 'between_tools', forcedTool: false }),
  'claude-fable-5-1': adaptive({ off: 'unsupported', forcedTool: false }),
  'claude-mythos-5-1': adaptive({ off: 'unsupported', forcedTool: false }),
  'claude-fable-5': adaptive({ off: 'unsupported' }),
  'claude-mythos-5': adaptive({ off: 'unsupported' }),
  'claude-opus-5': adaptive(),
  'claude-sonnet-5': adaptive(),
  'claude-opus-4-8': adaptive({ thinkingByDefault: false }),
  'claude-opus-4-7': adaptive({ thinkingByDefault: false }),
  'claude-opus-4-6': adaptive({ sampling: 'thinking', thinkingByDefault: false }),
  'claude-sonnet-4-6': adaptive({
    sampling: 'thinking',
    efforts: ['low', 'medium', 'high', 'max'],
    thinkingByDefault: false,
  }),
  'claude-opus-4-5': manual({ efforts: ['low', 'medium', 'high'], maxOutput: 64000 }),
  'claude-sonnet-4-5': manual({ maxOutput: 64000 }),
  'claude-haiku-4-5': manual({ maxOutput: 64000 }),
  'claude-opus-4-1': manual(),
  'claude-opus-4': manual(),
  'claude-sonnet-4': manual(),
  'claude-3-7-sonnet': manual(),
  'claude-3-5-sonnet': noThinking,
  'claude-3-5-haiku': noThinking,
  'claude-3-opus': noThinking,
  'claude-3-sonnet': noThinking,
  'claude-3-haiku': noThinking,
};

/** 旧别名：解析后先换成家族表的键 */
const ANTHROPIC_FAMILY_ALIASES: Record<string, string> = {
  'claude-opus-4-0': 'claude-opus-4',
  'claude-sonnet-4-0': 'claude-sonnet-4',
};

/**
 * 只用于查能力表，发出去的模型 ID 保持原值。顺序：小写 → 取最后一个 `/` 之后（网关前缀）→ 去掉开头的
 * `<地区>.anthropic.` 或 `anthropic.`（Bedrock）→ 去掉 `@` 及之后（Vertex 日期）→ 去掉结尾的 `-v<数字>(:<数字>)`
 * （Bedrock 版本）→ 去掉结尾的 8 位日期 → 去掉结尾的 `-latest` → 版本号里的点换成短横线；之后精确匹配
 * （含旧别名），匹配不到返回 undefined（按未知模型处理）
 */
export function normalizeAnthropicModelId(model: unknown): string {
  let id = String(model ?? '')
    .trim()
    .toLowerCase();
  id = id.slice(id.lastIndexOf('/') + 1);
  id = id.replace(/^(?:[a-z0-9-]+\.)?anthropic\./, '');
  const at = id.indexOf('@');
  if (at >= 0) id = id.slice(0, at);
  id = id.replace(/-v\d+(?::\d+)?$/, '');
  id = id.replace(/-\d{8}$/, '');
  id = id.replace(/-latest$/, '');
  id = id.replace(/(\d)\.(\d)/g, '$1-$2');
  return ANTHROPIC_FAMILY_ALIASES[id] ?? id;
}

export function resolveAnthropicModelCapabilities(
  model: unknown,
): AnthropicModelCapabilities | undefined {
  const family = normalizeAnthropicModelId(model);
  const entry = Object.prototype.hasOwnProperty.call(ANTHROPIC_FAMILIES, family)
    ? ANTHROPIC_FAMILIES[family]
    : undefined;
  return entry ? { family, ...entry, efforts: [...entry.efforts] } : undefined;
}

/** 手动思考的预算档：low 2048、medium 8192、high 及以上 16384 */
export const ANTHROPIC_MANUAL_BUDGETS: Record<'low' | 'medium' | 'high', number> = {
  low: 2048,
  medium: 8192,
  high: 16384,
};

/** 统一档位的高低顺序（off 与 minimal 在最低端） */
const LEVEL_ORDER: ModelGatewayReasoningEffort[] = [
  'off',
  'minimal',
  'low',
  'medium',
  'high',
  'xhigh',
  'max',
];

/** 不高于请求的最接近档位；请求低于所有可用档位（如 minimal）时取最低的可用档位 */
export function closestAnthropicEffortAtOrBelow(
  requested: ModelGatewayReasoningEffort,
  efforts: AnthropicEffort[],
): AnthropicEffort | undefined {
  if (!efforts.length) return undefined;
  const rank = LEVEL_ORDER.indexOf(requested);
  const below = efforts.filter(effort => LEVEL_ORDER.indexOf(effort) <= rank);
  return below.length ? below[below.length - 1] : efforts[0];
}

/** 目录写入的推理档位：adaptive 家族列出支持的档位、默认「中」；手动家族默认「关闭」；不支持思考的不写 */
export function anthropicCatalogReasoningControl(
  model: string,
):
  { levels: ModelGatewayReasoningEffort[]; defaultLevel: ModelGatewayReasoningEffort } | undefined {
  const capabilities = resolveAnthropicModelCapabilities(model);
  if (!capabilities || capabilities.thinking === 'none') return undefined;
  if (capabilities.thinking === 'manual') {
    return { levels: ['off', 'low', 'medium', 'high'], defaultLevel: 'off' };
  }
  return {
    levels: [
      ...(capabilities.off === 'unsupported' ? [] : (['off'] as ModelGatewayReasoningEffort[])),
      ...capabilities.efforts,
    ],
    defaultLevel: 'medium',
  };
}
