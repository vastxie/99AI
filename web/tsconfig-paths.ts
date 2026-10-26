import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'

/**
 * web 路径别名单源。
 *
 * vite / vitest 的 resolve.alias 由 tsconfig.json 的 compilerOptions.paths 派生，
 * 与 vue-tsc 使用同一份定义，type-check / test / build 三者解析结果一致；新增别名只改 tsconfig.json。
 * tsconfig.json 需保持严格 JSON（无注释、无尾逗号）。
 */
export interface PathAlias {
  find: RegExp
  replacement: string
}

interface TsconfigLike {
  compilerOptions?: { paths?: Record<string, string[]> }
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')
}

/** `@/*` → `./src/*` 这类通配映射转成正则别名；无通配的精确映射只匹配完整说明符 */
export function tsconfigPathsToAlias(
  tsconfigPath = resolve(import.meta.dirname, 'tsconfig.json')
): PathAlias[] {
  const tsconfig = JSON.parse(readFileSync(tsconfigPath, 'utf8')) as TsconfigLike
  // paths 相对 tsconfig 所在目录（TypeScript 6 起弃用 baseUrl）
  const configDir = dirname(tsconfigPath)
  const paths = tsconfig.compilerOptions?.paths ?? {}

  return Object.entries(paths).map(([pattern, targets]) => {
    const target = targets[0]
    if (!target) throw new Error(`tsconfig paths["${pattern}"] 没有映射目标`)
    const resolvedTarget = resolve(configDir, target.replace(/\/\*$/u, ''))
    if (pattern.endsWith('/*')) {
      return {
        find: new RegExp(`^${escapeRegExp(pattern.slice(0, -2))}/(.*)$`, 'u'),
        replacement: `${resolvedTarget}/$1`,
      }
    }
    return { find: new RegExp(`^${escapeRegExp(pattern)}$`, 'u'), replacement: resolvedTarget }
  })
}
