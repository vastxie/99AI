#!/usr/bin/env node
/**
 * 服务端内核模块依赖边门禁：模块之间的运行时 import 边只能持平或减少，不能新增。
 *
 * 度量对象：server/src/modules/<a> 里非测试 .ts 文件对 server/src/modules/<b> 的 import。
 *   - 只算运行时边：`import type` 与类型位置的 `import('x').T` 不计；
 *   - 同一对模块无论多少处引用只算一条边。
 * 基线：scripts/kernel-edges.json（按字母序的 "a -> b" 列表）。
 *
 * 用法：node scripts/check-kernel-edges.mjs          出现基线外的新边即失败
 *       node scripts/check-kernel-edges.mjs --write  把基线重设为当前实际边集（解环 / 删边后执行；新增边需在提交说明里解释）
 *       node scripts/check-kernel-edges.mjs --verbose 另打印每条边的引用文件数与当前的环
 */
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const modulesRoot = join(repoRoot, 'server/src/modules');
const baselinePath = join(repoRoot, 'scripts/kernel-edges.json');
const write = process.argv.includes('--write');
const verbose = process.argv.includes('--verbose');
const toPosix = (value) => value.split(sep).join('/');

function walk(directory, out = []) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) walk(path, out);
    else if (path.endsWith('.ts') && !path.endsWith('.d.ts') && !path.endsWith('.spec.ts')) {
      out.push(path);
    }
  }
  return out;
}

const modules = readdirSync(modulesRoot, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort();

/** 静态 import 语句（含 import type）与动态 import()；类型位置的 import('x').T 单独识别 */
const STATIC_IMPORT = /^import\s+(type\s+)?[^;]*?from\s+['"]([^'"]+)['"]/gm;
const DYNAMIC_IMPORT = /import\(\s*['"]([^'"]+)['"]\s*\)(\s*\.\s*[A-Z])?/g;
const REQUIRE = /require\(\s*['"]([^'"]+)['"]\s*\)/g;

function targetModule(fromFile, specifier) {
  if (specifier.startsWith('@/modules/')) return specifier.split('/')[2];
  if (!specifier.startsWith('.')) return undefined;
  const absolute = resolve(dirname(fromFile), specifier);
  const rel = toPosix(relative(modulesRoot, absolute));
  if (rel.startsWith('..')) return undefined;
  return rel.split('/')[0];
}

const edgeFiles = new Map(); // "a -> b" -> Set(files)
for (const module of modules) {
  for (const file of walk(join(modulesRoot, module))) {
    const source = readFileSync(file, 'utf8');
    const specifiers = [];
    for (const match of source.matchAll(STATIC_IMPORT)) {
      if (!match[1]) specifiers.push(match[2]);
    }
    for (const match of source.matchAll(DYNAMIC_IMPORT)) {
      if (!match[2]) specifiers.push(match[1]);
    }
    for (const match of source.matchAll(REQUIRE)) specifiers.push(match[1]);
    for (const specifier of specifiers) {
      const target = targetModule(file, specifier);
      if (!target || target === module || !modules.includes(target)) continue;
      const key = `${module} -> ${target}`;
      if (!edgeFiles.has(key)) edgeFiles.set(key, new Set());
      edgeFiles.get(key).add(toPosix(relative(repoRoot, file)));
    }
  }
}

const actual = [...edgeFiles.keys()].sort();
const baseline = existsSync(baselinePath)
  ? (JSON.parse(readFileSync(baselinePath, 'utf8')).edges ?? [])
  : [];
const added = actual.filter((edge) => !baseline.includes(edge));
const removed = baseline.filter((edge) => !actual.includes(edge));

if (write) {
  if (added.length) {
    console.warn(
      `警告：新增 ${added.length} 条内核依赖边，请在提交说明里解释：\n  ${added.join('\n  ')}`,
    );
  }
  writeFileSync(baselinePath, `${JSON.stringify({ edges: actual }, null, 2)}\n`);
  console.log(`已写入 ${toPosix(relative(repoRoot, baselinePath))}（${actual.length} 条边）`);
}

function stronglyConnectedComponents(nodes, edges) {
  const adjacency = new Map(nodes.map((node) => [node, []]));
  for (const edge of edges) {
    const [from, to] = edge.split(' -> ');
    adjacency.get(from).push(to);
  }
  let index = 0;
  const stack = [];
  const onStack = new Set();
  const indices = new Map();
  const lowLinks = new Map();
  const components = [];
  function visit(node) {
    indices.set(node, index);
    lowLinks.set(node, index);
    index += 1;
    stack.push(node);
    onStack.add(node);
    for (const next of adjacency.get(node)) {
      if (!indices.has(next)) {
        visit(next);
        lowLinks.set(node, Math.min(lowLinks.get(node), lowLinks.get(next)));
      } else if (onStack.has(next)) {
        lowLinks.set(node, Math.min(lowLinks.get(node), indices.get(next)));
      }
    }
    if (lowLinks.get(node) === indices.get(node)) {
      const component = [];
      let member;
      do {
        member = stack.pop();
        onStack.delete(member);
        component.push(member);
      } while (member !== node);
      if (component.length > 1) components.push(component.sort());
    }
  }
  for (const node of nodes) if (!indices.has(node)) visit(node);
  return components;
}

console.log(
  `内核模块 ${modules.length} 个，运行时依赖边 ${actual.length} 条（基线 ${baseline.length} 条）`,
);
if (verbose) {
  for (const edge of actual)
    console.log(`  ${String(edgeFiles.get(edge).size).padStart(3)}  ${edge}`);
  const cycles = stronglyConnectedComponents(modules, actual);
  if (cycles.length) {
    console.log(`当前存在 ${cycles.length} 组相互依赖的模块（信息，解环后用 --write 收紧基线）：`);
    for (const cycle of cycles) console.log(`  ${cycle.join(' <-> ')}`);
  }
}
if (removed.length) {
  console.log(
    `已消失的边 ${removed.length} 条（可用 --write 收紧基线）：\n  ${removed.join('\n  ')}`,
  );
}
if (added.length && !write) {
  console.error(`\n新增内核依赖边 ${added.length} 条，基线之外：`);
  for (const edge of added) {
    console.error(`  ${edge}`);
    for (const file of edgeFiles.get(edge)) console.error(`      ${file}`);
  }
  console.error(
    '请改为经端口 / 注册表 / 类型导入，或在确有必要时用 --write 重设基线并在提交说明里解释。',
  );
  process.exit(1);
}
console.log('内核依赖边检查通过：没有基线之外的新边。');
