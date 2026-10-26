/**
 * 从模型返回的 usage 对象中提取缓存命中指标
 *
 * 兼容不同 provider 的字段格式：
 * - DeepSeek: prompt_cache_hit_tokens / prompt_cache_miss_tokens
 * - OpenAI 等: prompt_tokens_details.cached_tokens
 *
 * 返回归一化后的缓存指标，缺少相关字段时不报错
 */
export function extractCacheMetrics(usage: any): {
  cacheHitTokens: number;
  cacheMissTokens: number;
} {
  const cacheHitTokens =
    usage?.prompt_cache_hit_tokens || usage?.prompt_tokens_details?.cached_tokens || 0;
  const cacheMissTokens =
    usage?.prompt_cache_miss_tokens ||
    (cacheHitTokens > 0 && usage?.prompt_tokens ? usage.prompt_tokens - cacheHitTokens : 0);

  return { cacheHitTokens, cacheMissTokens };
}
