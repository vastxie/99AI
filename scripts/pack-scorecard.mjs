#!/usr/bin/env node
/**
 * 扩展包评分卡：量化「内核不认识任何一个包、包随时可删」的达成度（CI 与本地同款）。
 * 依赖归属校验用 server 依赖里的 TypeScript 解析源码，运行前先在 server/ 安装依赖。
 *
 * 数据来源：
 *   - server/src/packs/<id>/pack.json（必需）、web/src/packs/<id>/pack.json、admin/src/packs/<id>/pack.json
 *   - 三端源码（内核 = 不在 packs/<id>/ 目录下的源码）
 *
 * 五个维度，满分 100：
 *   1. 边界隔离（25）  内核不 import 该包，其它包不 import 该包；客户端内核只经 packs/index.ts 的目录发现取包
 *   2. 内核零引用（25）内核源码（含测试、语言包）不出现该包在 identifiers 里声明的任何标识
 *   3. 清单与分级（15）三端清单 id / tier 一致，有 description，服务端有开关
 *   4. 贡献核对（15）  pack.json 里声明的每一项贡献都能在包源码里找到对应的登记；服务端 pack.json 的
 *                      dependencies 声明的宿主运行时依赖确实只归该包使用，只被服务端扩展包使用的宿主依赖都要
 *                      由使用它的包声明；客户端包不写 dependencies（依赖写在包自己的 package.json），
 *                      宿主里只被客户端包使用的依赖只作提示；动态计算的模块名不在校验范围内
 *   5. 测试与文档（20）服务端包有测试，有 README.md 且写清开关 / 贡献 / 删除影响
 *
 * 用法：node scripts/pack-scorecard.mjs [--write] [--verbose] [--min-grade A|B|C|D]
 *   --write      同步生成 docs/PACK_SCORECARD.md（维护者本地文档，docs/ 不入库）
 *   --min-grade  任一包低于该等级即退出码 1（默认 B）；依赖归属有问题时不论等级都退出码 1
 *
 * 源码收集口径、import 解析与依赖归属校验在 lib/pack-sources.mjs，与内核预算共用。
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import {
  APPS,
  OWNERSHIP_APP,
  SPECIFIER,
  analyzeDependencies,
  dependencyOwnership,
  kernelFiles,
  loadManifests,
  packFiles,
  repoRoot,
  toPosix,
  walk,
} from './lib/pack-sources.mjs';

const args = process.argv.slice(2);
const verbose = args.includes('--verbose');
const write = args.includes('--write');
const minGrade = (args[args.indexOf('--min-grade') + 1] || 'B').toUpperCase();
const GRADE_ORDER = ['D', 'C', 'B', 'A'];

/** 维度 1：边界隔离 */
function scoreBoundary(pack) {
  const problems = [];
  for (const [app, config] of Object.entries(APPS)) {
    const srcRoot = join(repoRoot, config.src);
    const packPrefix = `packs/${pack.id}/`;
    const targetsPack = (specifier, fromFile) => {
      let target = null;
      if (specifier.startsWith('@/')) target = specifier.slice(2);
      else if (specifier.startsWith('./') || specifier.startsWith('../'))
        target = toPosix(relative(srcRoot, resolve(dirname(fromFile), specifier)));
      if (!target) return false;
      return target === `packs/${pack.id}` || target.startsWith(packPrefix);
    };
    // 内核（含目录发现入口以外的所有文件）不得直接引用该包
    for (const file of kernelFiles(app)) {
      const rel = toPosix(relative(srcRoot, file));
      if (rel === config.registryRoot) continue; // 目录发现入口用 import.meta.glob，不点名
      const source = readFileSync(file, 'utf8');
      for (const match of source.matchAll(SPECIFIER)) {
        if (targetsPack(match[1], file)) problems.push(`${app}: 内核 ${rel} 引用了 ${match[1]}`);
      }
    }
    // 其它包不得引用该包
    const packsDir = join(srcRoot, 'packs');
    if (!existsSync(packsDir)) continue;
    for (const entry of readdirSync(packsDir, { withFileTypes: true })) {
      if (!entry.isDirectory() || entry.name === pack.id) continue;
      for (const file of packFiles(app, join(packsDir, entry.name))) {
        const source = readFileSync(file, 'utf8');
        for (const match of source.matchAll(SPECIFIER)) {
          if (targetsPack(match[1], file))
            problems.push(
              `${app}: 包 ${entry.name} 引用了 ${match[1]}（${toPosix(relative(srcRoot, file))}）`,
            );
        }
      }
    }
    // 目录发现入口不得点名任何包
    if (config.registryRoot) {
      const registry = join(srcRoot, config.registryRoot);
      if (existsSync(registry) && readFileSync(registry, 'utf8').includes(`packs/${pack.id}`))
        problems.push(`${app}: ${config.registryRoot} 点名了 ${pack.id}`);
    }
  }
  return { score: problems.length ? 0 : 25, max: 25, problems };
}

/** 维度 2：内核零引用 */
function scoreKernelReferences(pack) {
  const identifiers = new Set();
  for (const entry of Object.values(pack.apps)) {
    for (const identifier of entry.manifest?.identifiers ?? []) identifiers.add(identifier);
  }
  const hits = [];
  if (identifiers.size === 0) return { score: 0, max: 25, problems: ['清单未声明 identifiers'] };
  for (const [app, config] of Object.entries(APPS)) {
    const srcRoot = join(repoRoot, config.src);
    for (const file of kernelFiles(app)) {
      const rel = toPosix(relative(srcRoot, file));
      if (rel === config.registryRoot) continue;
      const lines = readFileSync(file, 'utf8').split('\n');
      lines.forEach((rawLine, index) => {
        // 链接里的域名不算代码引用
        const line = rawLine.replace(/https?:\/\/\S+/g, '');
        for (const identifier of identifiers) {
          if (line.includes(identifier)) {
            hits.push(`${app}: ${rel}:${index + 1} 含「${identifier}」`);
            break;
          }
        }
      });
    }
  }
  return { score: Math.max(0, 25 - hits.length * 3), max: 25, problems: hits };
}

/** 维度 3：清单与分级 */
function scoreManifest(pack) {
  const problems = [];
  const server = pack.apps.server;
  if (server && !server.manifest) problems.push('服务端缺少 pack.json');
  const tiers = new Set();
  for (const [app, entry] of Object.entries(pack.apps)) {
    if (!entry.manifest) {
      problems.push(`${app} 目录存在但没有 pack.json`);
      continue;
    }
    const manifest = entry.manifest;
    if (manifest.id !== pack.id) problems.push(`${app}: id（${manifest.id}）与目录名不一致`);
    if (!['system', 'feature'].includes(manifest.tier)) problems.push(`${app}: tier 无效`);
    else tiers.add(manifest.tier);
    if (!String(manifest.description || '').trim()) problems.push(`${app}: 缺少 description`);
    if (!/^[A-Z][A-Z0-9_]*$/.test(String(manifest.flag || ''))) problems.push(`${app}: 缺少开关名`);
  }
  if (tiers.size > 1) problems.push(`三端 tier 不一致：${[...tiers].join(' / ')}`);
  return { score: Math.max(0, 15 - problems.length * 5), max: 15, problems };
}

/** 维度 4：贡献核对（声明的贡献必须能在包源码里找到登记） */
function scoreContributions(pack) {
  const server = pack.apps.server;
  if (!server) return { score: 15, max: 15, problems: [] };
  if (!server.manifest) return { score: 0, max: 15, problems: ['服务端缺少 pack.json'] };
  const contributes = server.manifest.contributes ?? {};
  const sources = packFiles('server', server.dir)
    .filter((file) => !file.endsWith('.spec.ts') && !file.endsWith('pack.json'))
    .map((file) => readFileSync(file, 'utf8'))
    .join('\n');
  const problems = [];
  const expectLiteral = (label, literal) => {
    if (!sources.includes(literal)) problems.push(`${label} 声明了但源码里找不到 ${literal}`);
  };
  for (const name of contributes.configSections ?? [])
    expectLiteral('configSections', `name: '${name}'`);
  for (const item of contributes.loginProviders ?? []) {
    const [kind, provider] = item.split(':');
    expectLiteral('loginProviders', `'${provider}'`);
    expectLiteral('loginProviders', `'${kind}'`);
  }
  for (const protocol of contributes.modelProtocols ?? [])
    expectLiteral('modelProtocols', `'${protocol}'`);
  for (const name of contributes.storageProviders ?? [])
    expectLiteral('storageProviders', `'${name}'`);
  for (const section of contributes.verticalSections ?? [])
    expectLiteral('verticalSections', `'${section}'`);
  for (const port of contributes.ports ?? []) {
    const implementation = port.replace(/_PORT$/, '_IMPLEMENTATION');
    expectLiteral('ports', implementation);
  }
  problems.push(...(ownership.problems.get(pack.id) ?? []));
  return { score: Math.max(0, 15 - problems.length * 5), max: 15, problems };
}

/** 维度 5：测试与文档 */
function scoreQuality(pack) {
  const problems = [];
  let score = 20;
  const server = pack.apps.server;
  if (server) {
    const specs = walk(server.dir).filter((file) => file.endsWith('.spec.ts'));
    if (!specs.length) {
      score -= 5;
      problems.push('服务端包没有测试');
    }
    const readme = join(server.dir, 'README.md');
    if (!existsSync(readme)) {
      score -= 15;
      problems.push('缺少 README.md');
    } else {
      const text = readFileSync(readme, 'utf8');
      for (const heading of ['开关', '贡献', '删除']) {
        if (!text.includes(heading)) {
          score -= 5;
          problems.push(`README.md 未说明「${heading}」`);
        }
      }
    }
  } else {
    // 纯客户端包：README 放在客户端目录
    for (const entry of Object.values(pack.apps)) {
      if (!existsSync(join(entry.dir, 'README.md'))) {
        score -= 15;
        problems.push('客户端包缺少 README.md');
        break;
      }
    }
  }
  return { score: Math.max(0, score), max: 20, problems };
}

function grade(total) {
  if (total >= 90) return 'A';
  if (total >= 75) return 'B';
  if (total >= 60) return 'C';
  return 'D';
}

const DIMENSIONS = [
  ['边界隔离', scoreBoundary],
  ['内核零引用', scoreKernelReferences],
  ['清单与分级', scoreManifest],
  ['贡献核对', scoreContributions],
  ['测试与文档', scoreQuality],
];

const packs = loadManifests();
if (!packs.length) {
  console.error('没有发现任何扩展包目录');
  process.exit(1);
}
const ownership = dependencyOwnership(packs, analyzeDependencies(packs));

const rows = packs.map((pack) => {
  const results = DIMENSIONS.map(([name, fn]) => ({ name, ...fn(pack) }));
  const total = results.reduce((sum, item) => sum + item.score, 0);
  const tier =
    pack.apps.server?.manifest?.tier ?? Object.values(pack.apps)[0]?.manifest?.tier ?? '?';
  const apps = Object.keys(pack.apps).join(' / ');
  return { id: pack.id, tier, apps, results, total, grade: grade(total) };
});

const header = ['包', '分级', '所在端', ...DIMENSIONS.map(([name]) => name), '总分', '等级'];
const lines = [];
lines.push(`| ${header.join(' | ')} |`);
lines.push(`| ${header.map(() => '---').join(' | ')} |`);
for (const row of rows) {
  lines.push(
    `| ${[row.id, row.tier, row.apps, ...row.results.map((item) => `${item.score}/${item.max}`), row.total, row.grade].join(' | ')} |`,
  );
}
console.log(lines.join('\n'));

let failed = false;
for (const row of rows) {
  const problems = row.results.flatMap((item) =>
    item.problems.map((problem) => `[${item.name}] ${problem}`),
  );
  if (GRADE_ORDER.indexOf(row.grade) < GRADE_ORDER.indexOf(minGrade)) failed = true;
  if (
    problems.length &&
    (verbose || GRADE_ORDER.indexOf(row.grade) < GRADE_ORDER.indexOf(minGrade))
  ) {
    console.log(`\n${row.id}（${row.grade}，${row.total} 分）`);
    for (const problem of problems) console.log(`  - ${problem}`);
  }
}

// 依赖归属问题只扣分会被高分掩盖，而内核预算据声明扣除依赖：出现即失败，与等级无关
if (ownership.problems.size) {
  failed = true;
  console.log('\n依赖归属问题（与等级无关，出现即失败）：');
  for (const [id, problems] of ownership.problems) {
    for (const problem of problems) console.log(`  - ${id}: ${problem}`);
  }
}

const leaks = ownership.leaks;
// 服务端：由用到它的包在 pack.json 里声明；客户端：移到包自己的 package.json
const leakAdvice = (app) =>
  app === OWNERSHIP_APP ? '在该包的 pack.json dependencies 里声明' : '移到该包自己的 package.json';
if (leaks.length) {
  console.log('\n依赖归属提示：以下宿主运行时依赖只被扩展包 import：');
  for (const leak of leaks) {
    console.log(
      `  - ${leak.app}: ${leak.dependency} ← ${leak.packs.join(', ')}（${leakAdvice(leak.app)}）`,
    );
  }
}

if (write) {
  const doc = [
    '# 扩展包评分卡',
    '',
    `由 \`node scripts/pack-scorecard.mjs --write\` 生成，请勿手改。评分口径见 [PACKS.md](PACKS.md)。`,
    '',
    ...lines,
    '',
    '## 待改进项',
    '',
    ...rows.flatMap((row) => {
      const problems = row.results.flatMap((item) =>
        item.problems.map((problem) => `- [${item.name}] ${problem}`),
      );
      return problems.length ? [`### ${row.id}`, '', ...problems, ''] : [];
    }),
  ];
  if (!rows.some((row) => row.results.some((item) => item.problems.length))) doc.push('（无）', '');
  doc.push('## 依赖归属提示', '');
  if (leaks.length) {
    doc.push('以下宿主运行时依赖只被扩展包 import：', '');
    for (const leak of leaks)
      doc.push(
        `- ${leak.app}: \`${leak.dependency}\` ← ${leak.packs.join(', ')}（${leakAdvice(leak.app)}）`,
      );
    doc.push('');
  } else doc.push('（无）', '');
  mkdirSync(join(repoRoot, 'docs'), { recursive: true });
  writeFileSync(join(repoRoot, 'docs/PACK_SCORECARD.md'), doc.join('\n'));
  console.log('\n已写入 docs/PACK_SCORECARD.md');
}

if (failed) {
  console.error(`\n有扩展包低于 ${minGrade} 级或依赖归属有问题，请按上面的清单修正。`);
  process.exit(1);
}
