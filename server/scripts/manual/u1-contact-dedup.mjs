#!/usr/bin/env node
/**
 * U1 邮箱 / 手机号防重的真实 MySQL 验收（手动执行，不在 CI 里跑）。
 *
 *   U1_MYSQL_URL='mysql://<用户>:<密码>@127.0.0.1:3306/<空的测试库>' node scripts/manual/u1-contact-dedup.mjs
 *
 * - 只能指向一个**空的、隔离的**测试库：脚本发现库里已有表就拒绝执行；它会把库的默认排序规则设为
 *   utf8mb4_unicode_ci（与生产一致），建 users、user_auth_identities 两张表，结束时删除。不要指向开发库或生产库。
 * - 用多个数据源（多条连接）并发调用真实的 AuthIdentityService / CaptchaAuthService 与真实的邮箱、手机渠道适配器，
 *   用身份实体的 beforeInsert 订阅者做执行屏障固定竞争窗口；同时对构造的数据执行 u1-contact-gate.sql。用例见同目录的 .manual.ts。
 * - 输出只有计数与结论，不打印连接串。
 */
import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const serverRoot = resolve(here, '../..');

if (!process.env.U1_MYSQL_URL) {
  console.error('请设置 U1_MYSQL_URL，指向一个空的隔离测试库（见脚本开头说明）');
  process.exit(2);
}

const result = spawnSync(
  process.execPath,
  [
    resolve(serverRoot, 'scripts/run-jest.js'),
    '--roots',
    here,
    '--testRegex',
    'u1-contact-dedup\\.manual\\.ts$',
    '--runInBand',
    '--coverage=false',
  ],
  { cwd: serverRoot, stdio: 'inherit', env: process.env },
);
process.exit(result.status ?? 1);
