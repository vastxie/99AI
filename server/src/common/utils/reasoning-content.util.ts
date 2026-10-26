function getThinkingType(additionalParams?: Record<string, any>): string | undefined {
  const type =
    additionalParams?.extra_body?.thinking?.type ||
    additionalParams?.extraBody?.thinking?.type ||
    additionalParams?.thinking?.type;
  return typeof type === 'string' ? type.toLowerCase() : undefined;
}

export function shouldKeepReasoningContentForModel(
  model?: string,
  additionalParams?: Record<string, any>,
): boolean {
  const normalized = String(model || '').toLowerCase();
  const isDeepSeekModel = normalized.includes('deepseek');
  const isMimoModel = normalized.includes('mimo') || normalized.includes('xiaomi');
  if (!isDeepSeekModel && !isMimoModel) return false;

  const thinkingType = getThinkingType(additionalParams);
  if (thinkingType === 'disabled') return false;
  if (thinkingType === 'enabled') return true;

  if (isDeepSeekModel) return /(reason|r1|thinking|v4|pro)/i.test(normalized);

  return /v2(?:\.5)?(?:-|$)|pro|omni|flash|thinking/i.test(normalized);
}
