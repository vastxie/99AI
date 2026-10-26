/**
 * rspack 打包（nest build / nest start 均走 rspack，沿用 webpack 的 require.context 接口）时可用。
 * ts-jest / tsc 运行时并不存在；扩展包加载器调用失败后回退到文件系统扫描。
 */
declare namespace NodeJS {
  interface Require {
    context(directory: string, useSubdirectories?: boolean, regExp?: RegExp): WebpackRequireContext;
  }
}

interface WebpackRequireContext {
  keys(): string[];
  (id: string): unknown;
}
