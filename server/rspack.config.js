const { TsCheckerRspackPlugin } = require('ts-checker-rspack-plugin');

/**
 * Nest CLI 的 rspack 构建配置（nest-cli.json 的 builder 指向本文件）：在 Nest 默认配置上调整 SWC。
 * - 输出 CommonJS、由 rspack 按 CommonJS 打包，与原先 tsc 逐文件转译同为 CommonJS：只作类型用的导入
 *   （接口）在装饰器元数据里取到 undefined、回落为 Object，不会按 ES 模块链接报「导出不存在」。
 * - 编译目标与类字段语义对齐 tsconfig（ES2022，useDefineForClassFields）。
 * SWC 与 tsc 的产物并非处处相同（import * as 的互操作副本、被擦除的类型名在元数据里的取值等）；换用时已按
 * 当前代码核对依赖注入、实体列类型推断、扩展包发现与外部依赖，改动这些写法后以 CI 的真实启动冒烟为准。
 * 类型检查用 ts-checker-rspack-plugin：构建时有类型错误即失败，watch 时并行报告。Nest 默认只会自动加载
 * fork-ts-checker-webpack-plugin，它把 webpack 作为 peer 依赖带进来，这里改用 rspack 维护的同类插件。
 */
module.exports = options => {
  for (const rule of options.module.rules) {
    for (const use of [].concat(rule.use ?? [])) {
      if (use.loader !== 'builtin:swc-loader') continue;
      use.options.module = { type: 'commonjs' };
      use.options.jsc.target = 'es2022';
      use.options.jsc.transform.useDefineForClassFields = true;
    }
  }
  // Nest 只在能解析到 fork-ts-checker 时才会自动加它；先滤掉，保证只有一个类型检查器
  const plugins = options.plugins.filter(
    plugin => plugin?.constructor?.name !== 'ForkTsCheckerWebpackPlugin',
  );
  plugins.push(new TsCheckerRspackPlugin({ typescript: { configFile: options.resolve.tsConfig } }));
  // 只返回改动的部分：Nest 按「默认配置 → mode（watch 时为 development）→ 这里的返回值」合并，
  // 返回完整默认配置会把 watch 的 mode 覆盖回 none，类型检查也就从并行变成阻塞
  return { module: options.module, plugins };
};
