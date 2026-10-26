#!/usr/bin/env node
/**
 * 扩展包可删性验证（动态）：把某个包在三端的目录真的删掉，再跑类型检查与服务端装配测试。
 *
 * 做法：在临时目录里复制三端源码（各端与保留包的 node_modules 用符号链接），删除 server/web/admin 下的 packs/<id>，
 * 依次执行 server tsc、web vue-tsc、admin vue-tsc 与服务端 app.module.wiring.spec。
 * 每个包约需几分钟，适合发布前或改动内核边界后手动执行。
 *
 * 用法：node scripts/check-pack-removal.mjs [--all | <pack-id> ...] [--keep]
 *   --keep  保留临时目录便于排查
 */
import { cpSync, existsSync, mkdtempSync, readdirSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const keep = args.includes('--keep');
const wanted = args.filter((arg) => !arg.startsWith('--'));

const APPS = ['server', 'web', 'admin'];
const SHARED = ['packages'];

function listPacks() {
  const ids = new Set();
  for (const app of APPS) {
    const dir = join(repoRoot, app, 'src', 'packs');
    if (!existsSync(dir)) continue;
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) ids.add(entry.name);
    }
  }
  return [...ids].sort();
}

function copyTree(source, target) {
  cpSync(source, target, {
    recursive: true,
    filter: (path) =>
      !path.includes(`${join('', 'node_modules')}`) && !path.endsWith(`${join('', 'dist')}`),
  });
}

function link(source, target) {
  if (existsSync(source) && !existsSync(target)) symlinkSync(source, target, 'dir');
}

function run(label, command, cwd) {
  const started = Date.now();
  const result = spawnSync('sh', ['-c', command], { cwd, encoding: 'utf8' });
  const seconds = ((Date.now() - started) / 1000).toFixed(0);
  if (result.status === 0) {
    console.log(`    ✓ ${label}（${seconds}s）`);
    return true;
  }
  console.log(`    ✗ ${label}（${seconds}s）`);
  const output = `${result.stdout}\n${result.stderr}`
    .split('\n')
    .filter((line) => /error|Error|✕|FAIL/.test(line))
    .slice(0, 20);
  for (const line of output) console.log(`      ${line}`);
  return false;
}

const packs = wanted.length && !wanted.includes('--all') ? wanted : listPacks();
if (!packs.length) {
  console.error('没有发现任何扩展包');
  process.exit(1);
}

let failed = false;
for (const id of packs) {
  console.log(`\n== 删除 ${id} ==`);
  const work = mkdtempSync(join(tmpdir(), `pack-removal-${id}-`));
  try {
    for (const dir of [...APPS, ...SHARED]) copyTree(join(repoRoot, dir), join(work, dir));
    link(join(repoRoot, 'node_modules'), join(work, 'node_modules'));
    for (const app of APPS)
      link(join(repoRoot, app, 'node_modules'), join(work, app, 'node_modules'));
    for (const shared of SHARED) {
      for (const entry of readdirSync(join(repoRoot, shared), {
        withFileTypes: true,
      })) {
        if (entry.isDirectory())
          link(
            join(repoRoot, shared, entry.name, 'node_modules'),
            join(work, shared, entry.name, 'node_modules'),
          );
      }
    }
    // 带 package.json 的扩展包是 pnpm workspace 子包，运行时依赖装在包目录自己的 node_modules 里：
    // 复制树跳过了所有 node_modules，这里为仍保留的包补上链接，删包验证才能编译其余的包
    for (const app of APPS) {
      const packsDir = join(repoRoot, app, 'src', 'packs');
      if (!existsSync(packsDir)) continue;
      for (const entry of readdirSync(packsDir, { withFileTypes: true })) {
        if (!entry.isDirectory() || entry.name === id) continue;
        link(
          join(packsDir, entry.name, 'node_modules'),
          join(work, app, 'src', 'packs', entry.name, 'node_modules'),
        );
      }
    }
    let removed = 0;
    for (const app of APPS) {
      const dir = join(work, app, 'src', 'packs', id);
      if (existsSync(dir)) {
        rmSync(dir, { recursive: true, force: true });
        removed += 1;
      }
    }
    console.log(`  已删除 ${removed} 个目录`);
    const ok = [
      run('server tsc', 'npx tsc -p tsconfig.json --noEmit', join(work, 'server')),
      run(
        'server wiring spec',
        'node scripts/run-jest.js --silent src/app.module.wiring.spec.ts',
        join(work, 'server'),
      ),
      run('web vue-tsc', 'npx vue-tsc --noEmit', join(work, 'web')),
      run('admin vue-tsc', 'npx vue-tsc', join(work, 'admin')),
    ].every(Boolean);
    if (!ok) failed = true;
  } finally {
    if (keep) console.log(`  临时目录保留在 ${work}`);
    else rmSync(work, { recursive: true, force: true });
  }
}

if (failed) {
  console.error('\n有扩展包删除后内核无法通过检查');
  process.exit(1);
}
console.log('\n所有扩展包删除后内核均通过类型检查与装配测试');
