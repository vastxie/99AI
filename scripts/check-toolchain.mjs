#!/usr/bin/env node
/**
 * 工具链版本一致性检查：三端、文档站与仓库根的 `packageManager` 必须完全相同（CI 的复合 action
 * 只读仓库根这一份），各 `package.json` 的 `engines.node` 也必须相同。版本分散在多份清单里，
 * 这里保证它们一起改。另检查各份锁文件里带 tarball 的依赖都有已审核的完整性摘要
 * （见 lib/lockfile-integrity.mjs）。只用 Node 内置模块。
 *
 * 用法：node scripts/check-toolchain.mjs
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkLockfiles } from './lib/lockfile-integrity.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PACKAGE_MANAGER_MANIFESTS = [
  'package.json',
  'web/package.json',
  'admin/package.json',
  'server/package.json',
  'site/package.json',
];
const ENGINE_MANIFESTS = [
  ...PACKAGE_MANAGER_MANIFESTS,
  'packages/contracts/package.json',
  'packages/runtime-core/package.json',
];

const read = (path) => JSON.parse(readFileSync(resolve(root, path), 'utf8'));
const failures = [];

function expectSame(field, paths, pick) {
  const values = paths.map((path) => [path, pick(read(path))]);
  const [, expected] = values[0];
  if (!expected) failures.push(`${values[0][0]} 缺少 ${field}`);
  for (const [path, value] of values.slice(1)) {
    if (value !== expected)
      failures.push(`${path} 的 ${field} 是 ${value ?? '（未声明）'}，应与仓库根一致：${expected}`);
  }
  return expected;
}

const packageManager = expectSame(
  'packageManager',
  PACKAGE_MANAGER_MANIFESTS,
  (pkg) => pkg.packageManager,
);
const node = expectSame('engines.node', ENGINE_MANIFESTS, (pkg) => pkg.engines?.node);

if (failures.length) {
  process.stderr.write(`工具链版本不一致：\n${failures.map((line) => `  - ${line}`).join('\n')}\n`);
  process.exitCode = 1;
} else {
  process.stdout.write(`工具链版本一致：${packageManager}，Node ${node}\n`);
}

const lockfiles = checkLockfiles(root);
if (lockfiles.failures.length) {
  process.stderr.write(
    `锁文件完整性检查未通过：\n${lockfiles.failures.map((line) => `  - ${line}`).join('\n')}\n`,
  );
  process.exitCode = 1;
} else {
  process.stdout.write(`锁文件完整性：${lockfiles.tarballs} 个 tarball 依赖都带已审核的摘要\n`);
}
