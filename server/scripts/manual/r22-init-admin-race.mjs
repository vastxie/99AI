#!/usr/bin/env node
/**
 * R22 超级管理员初始化的真实 MySQL 验收（手动执行，不在 CI 里跑）。
 *
 *   R22_MYSQL_URL='mysql://<用户>:<密码>@127.0.0.1:3306/<空的测试库>' node scripts/manual/r22-init-admin-race.mjs
 *
 * - 只能指向一个**空的、隔离的**测试库（MySQL 8.0.16+，需要建表、改表权限）：库里已有表就拒绝执行；
 *   脚本建一张 users 表，结束时删除。不要指向开发库或生产库。
 * - 用两个数据源（两条连接）并发调用真实的 DatabaseService.checkSuperAdmin，覆盖随机密码（不同 / 相同文件路径）、
 *   环境变量密码、拿不到命名锁（约等 30 秒）、插入报错后锁被释放与下次启动复用密码文件。用例见同目录的 .manual.ts。
 * - 密码文件写在系统临时目录，结束时删除；输出只有计数与结论，不打印连接串与密码。
 */
import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const serverRoot = resolve(here, '../..');

if (!process.env.R22_MYSQL_URL) {
  console.error('请设置 R22_MYSQL_URL，指向一个空的隔离测试库（见脚本开头说明）');
  process.exit(2);
}

const result = spawnSync(
  process.execPath,
  [
    resolve(serverRoot, 'scripts/run-jest.js'),
    '--roots',
    here,
    '--testRegex',
    'r22-init-admin-race\\.manual\\.ts$',
    '--runInBand',
    '--coverage=false',
  ],
  { cwd: serverRoot, stdio: 'inherit', env: process.env },
);
process.exit(result.status ?? 1);
