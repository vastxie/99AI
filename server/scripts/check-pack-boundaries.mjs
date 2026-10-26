#!/usr/bin/env node
/**
 * 内核 / 扩展包边界检查（无第三方依赖，CI 与本地同款）。
 *
 * 规则：
 * 1. 内核（src/modules、src/common、src/test、src/main.ts、src/app.module.ts）不得 import 任何 src/packs 代码；
 *    组合根通过 modules/packs/pack.loader 按目录发现各包，不写包名。
 * 2. 包与包之间不得互相 import（src/packs/<a> 不得引用 src/packs/<b>）。
 * 3. 包只能通过 @/ 别名或包内相对路径引用内核；不得用相对路径穿出包目录（避免隐式耦合）。
 * 4. 包不得 import 内核的 .spec 文件；内核的公开面统计会打印出来，作为后续收缩的依据。
 *
 * 用法：node scripts/check-pack-boundaries.mjs [--verbose]
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const serviceRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const srcRoot = join(serviceRoot, 'src');
const verbose = process.argv.includes('--verbose');
const toPosix = value => value.split(sep).join('/');

function walk(directory, out = []) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) walk(path, out);
    else if (path.endsWith('.ts') && !path.endsWith('.d.ts')) out.push(path);
  }
  return out;
}

const SPECIFIER = /(?:from\s+|import\(|require\(|jest\.mock\(|jest\.requireActual\()\s*'([^']+)'/g;

function classify(relPath) {
  const parts = relPath.split('/');
  if (parts[0] === 'packs') return { layer: 'pack', pack: parts[1] };
  if (
    parts[0] === 'modules' ||
    parts[0] === 'common' ||
    parts[0] === 'test' ||
    relPath === 'main.ts' ||
    relPath === 'app.module.ts' ||
    relPath === 'app.module.wiring.spec.ts'
  )
    return { layer: 'kernel' };
  return { layer: 'other' };
}

const violations = [];
const kernelSurface = new Map();
let scanned = 0;

for (const file of walk(srcRoot)) {
  const relFile = toPosix(relative(srcRoot, file));
  const from = classify(relFile);
  if (from.layer === 'other') continue;
  const isSpec = relFile.endsWith('.spec.ts');
  const source = readFileSync(file, 'utf8');
  scanned += 1;
  for (const match of source.matchAll(SPECIFIER)) {
    const specifier = match[1];
    let targetRel;
    if (specifier.startsWith('@/')) targetRel = specifier.slice(2);
    else if (specifier.startsWith('./') || specifier.startsWith('../')) {
      targetRel = toPosix(relative(srcRoot, resolve(dirname(file), specifier)));
    } else continue;
    if (targetRel.startsWith('../')) continue; // 指向 src 之外（如 test 目录）
    const to = classify(targetRel);

    if (from.layer === 'kernel' && to.layer === 'pack') {
      violations.push(`${relFile}: 内核引用了扩展包 ${specifier}`);
    }
    if (from.layer === 'pack' && to.layer === 'pack' && to.pack !== from.pack) {
      violations.push(`${relFile}: 跨包引用 ${specifier}（${from.pack} -> ${to.pack}）`);
    }
    if (from.layer === 'pack' && to.layer === 'kernel') {
      if (!specifier.startsWith('@/')) {
        violations.push(`${relFile}: 用相对路径穿出包目录引用内核 ${specifier}，请改用 @/ 别名`);
      }
      if (!isSpec && targetRel.endsWith('.spec')) {
        violations.push(`${relFile}: 引用了内核测试文件 ${specifier}`);
      }
      if (!isSpec) kernelSurface.set(targetRel, (kernelSurface.get(targetRel) || 0) + 1);
    }
  }
}

const surface = [...kernelSurface.entries()].sort((a, b) => b[1] - a[1]);
console.log(`扫描 ${scanned} 个文件；扩展包引用的内核文件 ${surface.length} 个（公开面）`);
if (verbose)
  for (const [target, count] of surface) console.log(`  ${String(count).padStart(3)}  ${target}`);
if (violations.length) {
  console.error(`发现 ${violations.length} 处边界违规：`);
  for (const item of violations) console.error(`  - ${item}`);
  process.exit(1);
}
console.log('边界检查通过：内核不依赖扩展包，包之间互不引用。');
