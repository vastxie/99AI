#!/usr/bin/env node
/**
 * R21 解绑并发的真实 MySQL 验收（手动执行，不在 CI 里跑）。
 *
 *   R21_MYSQL_URL='mysql://<用户>:<密码>@127.0.0.1:3306/<空的测试库>' node scripts/manual/r21-unbind-concurrency.mjs
 *
 * - 只能指向一个**空的、隔离的**测试库：脚本发现库里已有表就拒绝执行；它会建 users、user_auth_identities
 *   两张表，结束时删除。不要指向开发库或生产库。
 * - 用两个数据源（两条连接）并发调用真实的 AuthIdentityService.unbindIdentity，用例见同目录的 .manual.ts。
 * - 输出只有计数与结论，不打印连接串。
 */
import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const serverRoot = resolve(here, '../..');

if (!process.env.R21_MYSQL_URL) {
  console.error('请设置 R21_MYSQL_URL，指向一个空的隔离测试库（见脚本开头说明）');
  process.exit(2);
}

const result = spawnSync(
  process.execPath,
  [
    resolve(serverRoot, 'scripts/run-jest.js'),
    '--roots',
    here,
    '--testRegex',
    'r21-unbind-concurrency\\.manual\\.ts$',
    '--runInBand',
    '--coverage=false',
  ],
  { cwd: serverRoot, stdio: 'inherit', env: process.env },
);
process.exit(result.status ?? 1);
