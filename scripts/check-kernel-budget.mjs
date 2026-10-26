#!/usr/bin/env node
/**
 * 内核预算门禁：内核只能变小或持平，不能在「加固」中悄悄长回去。
 *
 * 度量（都只算内核，不算扩展包 / 测试）：
 *   serverKernelLines        server/src/{modules,common}/**.ts + main.ts + app.module.ts（不含 *.spec.ts）
 *   webKernelLines           web/src/**.{ts,vue}（不含 packs/、*.spec.ts 与只供测试使用的 *.testkit.ts）
 *   adminKernelLines          admin/src/**.{ts,vue}（不含 packs/）
 *   databaseTables            server/src/modules/database/schema.current.json 里的表数
 *   serverRuntimeDependencies server/package.json 的 dependencies 中内核自己的依赖数
 *                             （扩展包在 pack.json 里声明、且通过评分卡同一套归属校验的依赖不计：
 *                              内核没用、用它的包都声明了、声明它的包都在用。没有源码 import 的依赖，
 *                              如 TypeORM 按配置加载的 mysql2、进程管理用的 pm2，照样算内核依赖）
 *
 * 用法：node scripts/check-kernel-budget.mjs          实际值超过 scripts/kernel-budget.json 即失败
 *       node scripts/check-kernel-budget.mjs --write  把预算重设为当前实际值（棘轮：只应在有意缩减后执行）
 */
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { analyzeDependencies, dependencyOwnership, loadManifests } from './lib/pack-sources.mjs';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const budgetPath = join(repoRoot, 'scripts/kernel-budget.json');
const write = process.argv.includes('--write');
const toPosix = (value) => value.split(sep).join('/');

function walk(directory, out = []) {
  if (!existsSync(directory)) return out;
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules') continue;
      walk(path, out);
    } else out.push(path);
  }
  return out;
}

function countLines(files) {
  let total = 0;
  for (const file of files) total += readFileSync(file, 'utf8').split('\n').length;
  return total;
}

function kernelSources(app, { extensions, excludeDirs, includeDirs, includeFiles, excludeSpecs }) {
  const srcRoot = join(repoRoot, app, 'src');
  return walk(srcRoot).filter((file) => {
    const rel = toPosix(relative(srcRoot, file));
    if (!extensions.some((ext) => file.endsWith(ext))) return false;
    if (excludeSpecs && /\.(spec|test|testkit)\.[cm]?[jt]s$/.test(file)) return false;
    if (excludeDirs.some((dir) => rel.startsWith(`${dir}/`))) return false;
    if (includeDirs) {
      return includeDirs.some((dir) => rel.startsWith(`${dir}/`)) || includeFiles.includes(rel);
    }
    return true;
  });
}

function measure() {
  const server = kernelSources('server', {
    extensions: ['.ts'],
    excludeDirs: ['packs'],
    includeDirs: ['modules', 'common'],
    includeFiles: ['main.ts', 'app.module.ts'],
    excludeSpecs: true,
  });
  const web = kernelSources('web', {
    extensions: ['.ts', '.vue'],
    excludeDirs: ['packs'],
    excludeSpecs: true,
  });
  const admin = kernelSources('admin', {
    extensions: ['.ts', '.vue'],
    excludeDirs: ['packs'],
    excludeSpecs: true,
  });
  const schemaPath = join(repoRoot, 'server/src/modules/database/schema.current.json');
  const schema = JSON.parse(readFileSync(schemaPath, 'utf8'));
  const tables = schema.tables ?? schema.entities ?? schema;
  const databaseTables = Array.isArray(tables) ? tables.length : Object.keys(tables).length;
  const servicePackage = JSON.parse(readFileSync(join(repoRoot, 'server/package.json'), 'utf8'));
  const packs = loadManifests();
  const packOwned =
    dependencyOwnership(packs, analyzeDependencies(packs)).owned.get('server') ?? new Set();
  return {
    serverKernelLines: countLines(server),
    webKernelLines: countLines(web),
    adminKernelLines: countLines(admin),
    databaseTables,
    serverRuntimeDependencies: Object.keys(servicePackage.dependencies || {}).filter(
      (name) => !packOwned.has(name),
    ).length,
  };
}

const actual = measure();
const budget = existsSync(budgetPath) ? JSON.parse(readFileSync(budgetPath, 'utf8')) : {};

if (write) {
  for (const [key, value] of Object.entries(actual)) {
    if (budget[key] !== undefined && value > budget[key]) {
      console.warn(
        `警告：${key} 预算从 ${budget[key]} 上调到 ${value}，请在提交说明里解释为什么内核必须变大`,
      );
    }
  }
  writeFileSync(budgetPath, `${JSON.stringify(actual, null, 2)}\n`);
  console.log(`已写入 ${toPosix(relative(repoRoot, budgetPath))}`);
  Object.assign(budget, actual);
}

let failed = false;
console.log('| 度量 | 实际 | 预算 | 状态 |');
console.log('| --- | --- | --- | --- |');
for (const [key, value] of Object.entries(actual)) {
  const limit = budget[key];
  const over = limit !== undefined && value > limit;
  if (over) failed = true;
  console.log(`| ${key} | ${value} | ${limit ?? '未设置'} | ${over ? '超出' : '通过'} |`);
}
if (failed) {
  console.error('\n内核超出预算：请先把内核减回预算内，或在有意扩容时用 --write 重设并说明原因。');
  process.exit(1);
}
