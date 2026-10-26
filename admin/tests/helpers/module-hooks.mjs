/**
 * node:test 用的模块钩子：让测试能直接加载 src 下带 `@/` 别名的 TS 源码。
 *
 * - `@/xxx` 解析到 src/xxx(.ts | /index.ts)；src 里不带扩展名的相对导入按同样的规则补全
 * - `dayjs/plugin/xxx` 补上 .js（dayjs 没有 exports 映射，Node ESM 不做扩展名探测）
 * - register(data.stubs) 里登记的说明符用内存里的替身模块替代（如 element-plus、请求层）
 *
 * 用法（测试文件顶部）：
 *   register('./helpers/module-hooks.mjs', { parentURL: import.meta.url, data: { stubs } });
 *   const mod = await import('../src/...ts');
 */
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const SRC_ROOT = new URL('../../src/', import.meta.url);
const STUB_SCHEME = 'admin-test-stub:';
const stubs = new Map();

export async function initialize(data) {
  for (const [specifier, source] of Object.entries(data?.stubs ?? {})) {
    stubs.set(specifier, source);
  }
}

export async function resolve(specifier, context, nextResolve) {
  if (stubs.has(specifier)) {
    return { url: `${STUB_SCHEME}${specifier}`, format: 'module', shortCircuit: true };
  }
  if (specifier.startsWith('@/')) {
    const rel = specifier.slice(2);
    const candidate = [`${rel}.ts`, `${rel}/index.ts`, rel].find((item) =>
      existsSync(fileURLToPath(new URL(item, SRC_ROOT))),
    );
    if (!candidate) throw new Error(`module-hooks: 无法解析别名 ${specifier}`);
    return nextResolve(new URL(candidate, SRC_ROOT).href, context);
  }
  const fromSource = context.parentURL?.startsWith(SRC_ROOT.href);
  if (fromSource && specifier.startsWith('.') && !/\.[cm]?[jt]s$|\.json$/u.test(specifier)) {
    const candidate = [`${specifier}.ts`, `${specifier}/index.ts`]
      .map((item) => new URL(item, context.parentURL))
      .find((url) => existsSync(fileURLToPath(url)));
    if (candidate) return nextResolve(candidate.href, context);
  }
  if (/^dayjs\/plugin\/[\w-]+$/u.test(specifier)) {
    return nextResolve(`${specifier}.js`, context);
  }
  return nextResolve(specifier, context);
}

export async function load(url, context, nextLoad) {
  if (url.startsWith(STUB_SCHEME)) {
    return {
      format: 'module',
      source: stubs.get(url.slice(STUB_SCHEME.length)),
      shortCircuit: true,
    };
  }
  return nextLoad(url, context);
}
