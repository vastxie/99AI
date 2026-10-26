import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const ADMIN_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(ADMIN_ROOT, 'src');

function sourceFiles(dir, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === 'types') continue;
    const path = join(dir, entry.name);
    if (entry.isDirectory()) sourceFiles(path, out);
    else if (/\.(ts|vue)$/u.test(entry.name) && !entry.name.endsWith('.d.ts')) out.push(path);
  }
  return out;
}

/** 运行时 import 的包名（不含 import type、相对路径、@/ 别名与 virtual: 模块） */
function importedPackages(source) {
  const specifiers = [
    ...source.matchAll(/^\s*import\s+(?!type\b)(?:[^'"]*?\sfrom\s+)?['"]([^'"]+)['"]/gmu),
    ...source.matchAll(/\bimport\(\s*['"]([^'"]+)['"]\s*\)/gu),
  ].map((match) => match[1]);
  return specifiers
    .filter(
      (spec) => !spec.startsWith('.') && !spec.startsWith('@/') && !spec.startsWith('virtual:'),
    )
    .map((spec) =>
      spec
        .split('/')
        .slice(0, spec.startsWith('@') ? 2 : 1)
        .join('/'),
    );
}

function dependenciesOf(manifestPath) {
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  return new Set(Object.keys(manifest.dependencies ?? {}));
}

test('src 运行时 import 的第三方包都声明在 dependencies 里（带 package.json 的扩展包另可用自己声明的依赖）', () => {
  const rootDependencies = dependenciesOf(join(ADMIN_ROOT, 'package.json'));
  const missing = [];
  for (const file of sourceFiles(SRC)) {
    const rel = relative(ADMIN_ROOT, file).split(sep).join('/');
    const packDir = rel.match(/^src\/packs\/[^/]+/u)?.[0];
    const packManifest = packDir ? join(ADMIN_ROOT, packDir, 'package.json') : '';
    const allowed = new Set(rootDependencies);
    if (packManifest && existsSync(packManifest)) {
      for (const name of dependenciesOf(packManifest)) allowed.add(name);
    }
    for (const name of importedPackages(readFileSync(file, 'utf8'))) {
      if (!allowed.has(name)) missing.push(`${rel} → ${name}`);
    }
  }
  assert.deepEqual(missing, []);
});
