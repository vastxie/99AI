import { existsSync, readdirSync } from 'fs';
import { join } from 'path';
import type { Type } from '@nestjs/common';
import { assertPackDefinition, PackDefinition } from './pack.types';

export interface DiscoveredPack extends PackDefinition {
  /** 包目录名（等于 id） */
  dir: string;
}

const DISABLED_VALUES = new Set(['false', '0', 'off', 'no']);

/**
 * 包开关：只读取清单声明的 flag，未设置视为启用。
 * 该值在模块装饰器求值时读取，main.ts 必须先加载 .env 再导入 AppModule。
 */
export function isPackEnabled(
  pack: Pick<PackDefinition, 'flag'>,
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  const raw = env[pack.flag];
  if (raw === undefined) return true;
  return !DISABLED_VALUES.has(String(raw).trim().toLowerCase());
}

interface PackSource {
  dir: string;
  load: () => unknown;
}

/** rspack 打包产物：require.context 在构建期把 src/packs/＊/pack.ts 全部收进来 */
function bundledSources(): PackSource[] | null {
  try {
    const context = require.context('../../packs', true, /^\.\/[^/]+\/pack\.ts$/);
    return context.keys().map(key => ({ dir: key.split('/')[1], load: () => context(key) }));
  } catch {
    return null;
  }
}

/** ts-jest / tsc 产物：扫描目录，逐个 require */
function filesystemSources(root: string): PackSource[] {
  if (!existsSync(root)) return [];
  // 显式带扩展名：目录里同时有 pack.json，按 jest / node 的默认扩展名顺序解析 `pack` 会先命中 JSON
  return readdirSync(root, { withFileTypes: true })
    .filter(entry => entry.isDirectory())
    .map(entry => entry.name)
    .map(dir => ({
      dir,
      file: ['pack.ts', 'pack.js'].find(name => existsSync(join(root, dir, name))),
    }))
    .filter((entry): entry is { dir: string; file: string } => Boolean(entry.file))
    .map(({ dir, file }) => ({ dir, load: () => require(join(root, dir, file)) }));
}

function unwrapDefault(loaded: unknown): unknown {
  return loaded && typeof loaded === 'object' && 'default' in loaded
    ? (loaded as { default: unknown }).default
    : loaded;
}

/**
 * 发现 src/packs 下所有扩展包（不看开关），按 id 排序。
 * 组合根、装配测试都以此为准；删掉包目录即从结果中消失。
 */
export function discoverPacks(options: { root?: string } = {}): DiscoveredPack[] {
  const sources = options.root
    ? filesystemSources(options.root)
    : (bundledSources() ?? filesystemSources(join(__dirname, '..', '..', 'packs')));
  return sources
    .map(source => {
      const definition = assertPackDefinition(unwrapDefault(source.load()));
      if (definition.id !== source.dir) {
        throw new Error(`扩展包目录 ${source.dir} 的清单 id（${definition.id}）必须等于目录名`);
      }
      return { ...definition, dir: source.dir };
    })
    .sort((a, b) => a.id.localeCompare(b.id));
}

/** 组合根用：已启用的包模块，按 id 排序 */
export function loadEnabledPackModules(env: NodeJS.ProcessEnv = process.env): Type<unknown>[] {
  return discoverPacks()
    .filter(pack => isPackEnabled(pack, env))
    .map(pack => pack.module);
}
