type AnyFunction = (...args: any[]) => any;

/**
 * 按真实契约的 GlobalConfigService 替身：getConfigs 一个键返回值本身、多个键返回对象；
 * getConfigWithFallback 返回配置值或兜底值。values 可以在用例里随时改（模拟后台改配置）。
 */
export function createGlobalConfigFake(
  fn: (impl?: AnyFunction) => any,
  values: Record<string, any>,
) {
  return {
    values,
    getConfigs: fn(async (keys: string[]) =>
      keys.length === 1 ? values[keys[0]] : Object.fromEntries(keys.map(key => [key, values[key]])),
    ),
    getConfigWithFallback: fn(
      async (key: string, _envKey?: string, fallback = '') => values[key] || fallback,
    ),
  };
}
