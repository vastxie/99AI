#!/usr/bin/env node
/**
 * 支付补单与入账竞争的真实 MySQL 验收（手动执行，不在 CI 里跑）。
 *
 *   FB_MYSQL_URL='mysql://<用户>:<密码>@127.0.0.1:3306/<空的测试库>' node scripts/manual/fb-reconcile-mysql.mjs
 *
 * - 只能指向一个**空的、隔离的**测试库：脚本发现库里已有表就拒绝执行；它会建 order、users、package
 *   与一张发货记录表，结束时删除。不要指向开发库或生产库。
 * - 用例见同目录的 .manual.ts：两条连接并发入账同一笔订单（可重复读下竞争失败方报「已处理」）；
 *   会话时区为 UTC 与 +08:00 时，补单按数据库时钟算年龄、挑出的订单相同。
 * - 输出只有计数与结论，不打印连接串。
 */
import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const serverRoot = resolve(here, '../..');

if (!process.env.FB_MYSQL_URL) {
  console.error('请设置 FB_MYSQL_URL，指向一个空的隔离测试库（见脚本开头说明）');
  process.exit(2);
}

const result = spawnSync(
  process.execPath,
  [
    resolve(serverRoot, 'scripts/run-jest.js'),
    '--roots',
    here,
    '--testRegex',
    'fb-reconcile-mysql\\.manual\\.ts$',
    '--runInBand',
    '--coverage=false',
  ],
  { cwd: serverRoot, stdio: 'inherit', env: process.env },
);
process.exit(result.status ?? 1);
