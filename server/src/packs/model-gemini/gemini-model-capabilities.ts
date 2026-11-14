import {
  mapModelGatewayReasoningEffort,
  ModelGatewayCapabilities,
  ModelGatewayReasoningControl,
  ModelGatewayReasoningEffort,
  ModelGatewayRequest,
  shouldApplyModelGatewayReasoningEffort,
} from '@/modules/modelGateway/model-gateway.types';

/**
 * 归一化 Gemini 模型标识（仅用于内部能力判断，实际请求保留原始模型名）：
 * 小写 -> 取最后一个 `/` 之后（兼容 `models/...` 与网关前缀） -> 去掉 `@` 版本后缀
 */
export function normalizeGeminiModelId(model: unknown): string {
  let id = String(model ?? '')
    .trim()
    .toLowerCase();
  id = id.slice(id.lastIndexOf('/') + 1);
  const at = id.indexOf('@');
  if (at >= 0) id = id.slice(0, at);
  return id;
}

/** Gemini 3 及以后代际（含 Gemini 4）在函数调用回放中会校验思考签名 */
export function isSignatureValidatingGeminiModel(model: unknown): boolean {
  return /^gemini-(?:[3-9]|\d{2,})(?:\.|-|$)/.test(normalizeGeminiModelId(model));
}

export function isGemini3OrLaterModel(model: unknown): boolean {
  return isSignatureValidatingGeminiModel(model);
}

function isGemini4Model(id: string): boolean {
  return /^gemini-4(?:\.|-|$)/.test(id);
}

function isGemini4HydrogenModel(id: string): boolean {
  return /^gemini-4-hydrogen(?:\.|-|$)/.test(id);
}

function isGemini3Model(id: string): boolean {
  return /^gemini-3(?:\.|-|$)/.test(id);
}

function isGemini3FlashModel(id: string): boolean {
  return /^gemini-3(?:\.\d+)?-flash(?:\.|-|$)/.test(id);
}

function supportsGemini3MinimalLevel(id: string): boolean {
  return /^gemini-3(?:\.1)?-flash(?:\.|-|$)/.test(id);
}

function isGemini25BudgetModel(id: string): boolean {
  return (
    /^gemini-2\.5(?:\.|-|$)/.test(id) ||
    id === 'gemini-flash-latest' ||
    id === 'gemini-flash-lite-latest'
  );
}

function isGemini25ProModel(id: string): boolean {
  return /^gemini-2\.5-pro(?:\.|-|$)/.test(id);
}

function isGemma4Model(id: string): boolean {
  return /^gemma-4(?:\.|-|$)/.test(id);
}

function isNonThinkingModalModel(id: string): boolean {
  if (id.includes('-tts') || id.includes('-transcribe')) return true;
  if (id.includes('-live') && !id.includes('-extended-thinking')) return true;
  return /^gemini-(?:1|2\.0)(?:\.|-|$)/.test(id);
}

/** 模型默认支持返回思考摘要（未显式指定档位时也请求 includeThoughts） */
export function supportsGeminiDefaultThoughts(
  model: unknown,
  capabilities?: ModelGatewayCapabilities | null,
): boolean {
  if (capabilities?.reasoning === 'none') return false;
  const id = normalizeGeminiModelId(model);
  if (!id || isNonThinkingModalModel(id)) return false;
  return (
    /^gemini-(?:[3-9]|\d{2,})(?:\.|-|$)/.test(id) || isGemini25BudgetModel(id) || isGemma4Model(id)
  );
}

/** 目录预设的推荐推理档位（仅在后台从模型目录新选模型时填入表单） */
export function geminiCatalogReasoningControl(
  model: unknown,
): ModelGatewayReasoningControl | undefined {
  const id = normalizeGeminiModelId(model);
  if (!id || isNonThinkingModalModel(id)) return undefined;
  if (isGemini4HydrogenModel(id)) {
    return {
      levels: ['low', 'medium', 'high', 'xhigh'],
      defaultLevel: 'medium',
    };
  }
  if (isGemini4Model(id)) {
    return {
      levels: ['low', 'medium', 'high'],
      defaultLevel: 'medium',
    };
  }
  if (isGemini3Model(id)) {
    if (supportsGemini3MinimalLevel(id)) {
      return {
        levels: ['off', 'minimal', 'low', 'medium', 'high'],
        defaultLevel: 'medium',
      };
    }
    if (isGemini3FlashModel(id)) {
      return {
        levels: ['off', 'low', 'medium', 'high'],
        defaultLevel: 'medium',
      };
    }
    return {
      levels: ['low', 'medium', 'high'],
      defaultLevel: 'medium',
    };
  }
  if (isGemini25BudgetModel(id)) {
    return {
      levels: isGemini25ProModel(id)
        ? ['low', 'medium', 'high', 'max']
        : ['off', 'low', 'medium', 'high', 'max'],
      defaultLevel: 'medium',
    };
  }
  return undefined;
}

export function buildGeminiThinkingConfig(
  request: ModelGatewayRequest,
): Record<string, string | number | boolean> | undefined {
  const id = normalizeGeminiModelId(request.config.model);
  const capabilities = request.config.capabilities;
  if (!id || capabilities?.reasoning === 'none' || isNonThinkingModalModel(id)) {
    return undefined;
  }

  const defaultThoughts = supportsGeminiDefaultThoughts(id, capabilities);
  if (!defaultThoughts) {
    return undefined;
  }

  if (request.disableThinking) {
    if (isGemma4Model(id)) return undefined;
    if (isGemini4Model(id) || (isGemini3Model(id) && !isGemini3FlashModel(id))) {
      return { thinkingLevel: 'LOW' };
    }
    if (isGemini25ProModel(id)) {
      return { thinkingBudget: 128 };
    }
    return { thinkingBudget: 0 };
  }

  const effort = request.config.reasoningEffort;
  if (!shouldApplyModelGatewayReasoningEffort(effort) || isGemma4Model(id)) {
    return { includeThoughts: true };
  }

  const mapped = mapModelGatewayReasoningEffort(effort, capabilities);
  if (mapped === null) return undefined;
  const normalized = String(mapped || effort).toLowerCase();
  const canonical = normalizeGeminiReasoningLevel(normalized, effort);
  const isOff = effort === 'off' || normalized === 'off' || normalized === 'none';

  if (isGemini4Model(id)) {
    // Gemini 4 全系不支持关闭与 MINIMAL：返回与 baseline 相同的配置，探针自动跳过、运行期安全回退默认档
    if (isOff || canonical === 'minimal') {
      return { includeThoughts: true };
    }
    const level =
      canonical === 'low'
        ? 'LOW'
        : canonical === 'medium'
          ? 'MEDIUM'
          : canonical === 'xhigh' || canonical === 'max'
            ? isGemini4HydrogenModel(id)
              ? 'XHIGH'
              : 'HIGH'
            : 'HIGH';
    return { includeThoughts: true, thinkingLevel: level };
  }

  if (isGemini3Model(id)) {
    if (isOff) {
      return isGemini3FlashModel(id) ? { thinkingBudget: 0 } : { includeThoughts: true };
    }
    if (canonical === 'minimal' && !supportsGemini3MinimalLevel(id)) {
      return { includeThoughts: true };
    }
    return {
      includeThoughts: true,
      thinkingLevel:
        canonical === 'minimal'
          ? 'MINIMAL'
          : canonical === 'low'
            ? 'LOW'
            : canonical === 'medium'
              ? 'MEDIUM'
              : 'HIGH',
    };
  }

  if (isGemini25BudgetModel(id)) {
    if (isOff) {
      return isGemini25ProModel(id) ? { includeThoughts: true } : { thinkingBudget: 0 };
    }
    const budgets: Record<ModelGatewayReasoningEffort, number> = {
      off: 0,
      minimal: 1024,
      low: 2048,
      medium: 8192,
      high: 16384,
      xhigh: isGemini25ProModel(id) ? 32768 : 24576,
      max: -1,
    };
    return {
      includeThoughts: true,
      thinkingBudget: budgets[canonical],
    };
  }

  return { includeThoughts: true };
}

function normalizeGeminiReasoningLevel(
  value: string,
  fallback: ModelGatewayReasoningEffort,
): ModelGatewayReasoningEffort {
  return ['off', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'].includes(value)
    ? (value as ModelGatewayReasoningEffort)
    : fallback;
}
