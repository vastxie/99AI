/**
 * R22 真实 MySQL 验收：两个数据源（两条连接）并发调用真实的 DatabaseService.checkSuperAdmin。
 * 由 r22-init-admin-race.mjs 启动；目标库必须是空的隔离测试库（见该脚本说明）。
 */
import * as bcrypt from 'bcryptjs';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { DataSource } from 'typeorm';
import {
  DatabaseService,
  parseInitialPasswordFile,
} from '../../src/modules/database/database.service';
import { UserEntity } from '../../src/modules/user/user.entity';

declare const afterAll: any;
declare const afterEach: any;
declare const beforeAll: any;
declare const describe: any;
declare const expect: any;
declare const it: any;

const LOCK = '99agent:init-admin';
const TIMEOUT_MS = 120_000;
const report = (line: string) => process.stdout.write(`[R22] ${line}\n`);

const dataSource = () =>
  new DataSource({
    type: 'mysql',
    url: process.env.R22_MYSQL_URL,
    entities: [UserEntity],
    synchronize: false,
    poolSize: 2,
  });

describe('R22 super admin initialization on a real MySQL with two connections', () => {
  const sourceA = dataSource();
  const sourceB = dataSource();
  const holder = dataSource();
  /** 确认是空库之后才置位：只有这时才允许建表、写数据与清理（误指向已有库时什么都不写、不删） */
  let ownsDatabase = false;
  let ready = false;
  const assertReady = () => {
    if (!ready) throw new Error('前置检查没有通过：本用例不对数据库做任何写入');
  };
  let dir: string | undefined;

  const supers = async () =>
    (await sourceA.query("SELECT password, storageId FROM users WHERE role = 'super'")) as Array<{
      password: string;
      storageId: string;
    }>;
  const lockIsFree = async () =>
    Number((await sourceA.query('SELECT IS_FREE_LOCK(?) AS free', [LOCK]))[0].free) === 1;
  const fileIn = (name: string) => path.join(dir as string, name, 'initial-admin-password.txt');
  const matches = (file: string, row: { password: string; storageId: string }) => {
    const parsed = parseInitialPasswordFile(fs.readFileSync(file, 'utf8'));
    return (
      !!parsed &&
      parsed.storageId === row.storageId &&
      bcrypt.compareSync(parsed.password, row.password)
    );
  };

  beforeAll(async () => {
    await sourceA.initialize();
    const [{ total }] = await sourceA.query(
      'SELECT COUNT(*) AS total FROM information_schema.tables WHERE table_schema = DATABASE()',
    );
    if (Number(total) !== 0) {
      throw new Error('目标库里已有表：为避免误伤，本验收只在空的隔离测试库上执行');
    }
    ownsDatabase = true;
    await sourceA.synchronize();
    await sourceB.initialize();
    await holder.initialize();
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'r22-init-admin-'));
    ready = true;
  }, TIMEOUT_MS);

  afterEach(async () => {
    // 前置检查没通过时不清理：那时连到的可能是别人的库
    if (!ready) return;
    await sourceA.query("DELETE FROM users WHERE role = 'super'");
    if (dir) {
      fs.rmSync(dir, { recursive: true, force: true });
      fs.mkdirSync(dir, { recursive: true });
    }
  }, TIMEOUT_MS);

  afterAll(async () => {
    if (dir) fs.rmSync(dir, { recursive: true, force: true });
    if (ownsDatabase && sourceA.isInitialized) {
      await sourceA.query('DROP TABLE IF EXISTS `users`');
      report('已删除本验收建的 users 表与临时密码文件');
    }
    for (const source of [holder, sourceB, sourceA]) {
      if (source.isInitialized) await source.destroy();
    }
  }, TIMEOUT_MS);

  it(
    'creates exactly one admin when two initializers use different password file paths',
    async () => {
      assertReady();
      const a = new DatabaseService(sourceA);
      const b = new DatabaseService(sourceB);
      const settled = await Promise.allSettled([
        a.checkSuperAdmin({ ADMIN_INITIAL_PASSWORD_FILE: fileIn('a') }),
        b.checkSuperAdmin({ ADMIN_INITIAL_PASSWORD_FILE: fileIn('b') }),
      ]);
      const rows = await supers();
      const files = [fileIn('a'), fileIn('b')].filter(file => fs.existsSync(file));
      const ok = rows.length === 1 && files.length === 1 && matches(files[0], rows[0]);
      report(
        `不同文件路径：${settled.map(item => item.status).join('+')}，管理员 ${rows.length} 个，密码文件 ${files.length} 个，文件与账号一致 ${ok}，锁已释放 ${await lockIsFree()}`,
      );
      expect(settled.map(item => item.status)).toEqual(['fulfilled', 'fulfilled']);
      expect(ok).toBe(true);
      expect(await lockIsFree()).toBe(true);
    },
    TIMEOUT_MS,
  );

  it(
    'creates exactly one admin when two initializers share the password file path',
    async () => {
      assertReady();
      const env = { ADMIN_INITIAL_PASSWORD_FILE: fileIn('shared') };
      const settled = await Promise.allSettled([
        new DatabaseService(sourceA).checkSuperAdmin(env),
        new DatabaseService(sourceB).checkSuperAdmin(env),
      ]);
      const rows = await supers();
      const ok = rows.length === 1 && matches(fileIn('shared'), rows[0]);
      report(
        `相同文件路径：${settled.map(item => item.status).join('+')}，管理员 ${rows.length} 个，文件与账号一致 ${ok}`,
      );
      expect(settled.map(item => item.status)).toEqual(['fulfilled', 'fulfilled']);
      expect(ok).toBe(true);
    },
    TIMEOUT_MS,
  );

  it(
    'creates exactly one admin from ADMIN_INITIAL_PASSWORD without writing a file',
    async () => {
      assertReady();
      const password = `r22-${Date.now()}`.slice(0, 20);
      const env = { ADMIN_INITIAL_PASSWORD: password, ADMIN_INITIAL_PASSWORD_FILE: fileIn('env') };
      const settled = await Promise.allSettled([
        new DatabaseService(sourceA).checkSuperAdmin(env),
        new DatabaseService(sourceB).checkSuperAdmin(env),
      ]);
      const rows = await supers();
      const ok =
        rows.length === 1 &&
        bcrypt.compareSync(password, rows[0].password) &&
        !fs.existsSync(fileIn('env'));
      report(
        `环境变量密码：${settled.map(item => item.status).join('+')}，管理员 ${rows.length} 个，口令一致且没有文件 ${ok}`,
      );
      expect(settled.map(item => item.status)).toEqual(['fulfilled', 'fulfilled']);
      expect(ok).toBe(true);
    },
    TIMEOUT_MS,
  );

  it(
    'creates nothing when another connection holds the lock (waits about 30 seconds)',
    async () => {
      assertReady();
      const runner = holder.createQueryRunner();
      await runner.connect();
      try {
        await runner.query('SELECT GET_LOCK(?, 0)', [LOCK]);
        const started = Date.now();
        const [settled] = await Promise.allSettled([
          new DatabaseService(sourceA).checkSuperAdmin({
            ADMIN_INITIAL_PASSWORD_FILE: fileIn('blocked'),
          }),
        ]);
        const waited = Math.round((Date.now() - started) / 1000);
        const rows = await supers();
        report(
          `锁被占用：${settled.status}，等待约 ${waited} 秒，管理员 ${rows.length} 个，写了文件 ${fs.existsSync(fileIn('blocked'))}`,
        );
        expect(settled.status).toBe('rejected');
        expect(rows).toHaveLength(0);
        expect(fs.existsSync(fileIn('blocked'))).toBe(false);
      } finally {
        await runner.query('SELECT RELEASE_LOCK(?)', [LOCK]);
        await runner.release();
      }
    },
    TIMEOUT_MS,
  );

  it(
    'releases the lock after an insert error and reuses the kept file on the next start',
    async () => {
      assertReady();
      const env = { ADMIN_INITIAL_PASSWORD_FILE: fileIn('retry') };
      await sourceA.query(
        "ALTER TABLE users ADD CONSTRAINT r22_no_super CHECK (username <> 'super')",
      );
      let first: PromiseSettledResult<void>;
      try {
        [first] = await Promise.allSettled([new DatabaseService(sourceA).checkSuperAdmin(env)]);
      } finally {
        await sourceA.query('ALTER TABLE users DROP CHECK r22_no_super');
      }
      const freeAfterError = await lockIsFree();
      const kept = fs.readFileSync(fileIn('retry'), 'utf8');
      await new DatabaseService(sourceB).checkSuperAdmin(env);
      const rows = await supers();
      const ok =
        rows.length === 1 &&
        fs.readFileSync(fileIn('retry'), 'utf8') === kept &&
        matches(fileIn('retry'), rows[0]);
      report(
        `插入报错：第一次 ${first.status}，锁已释放 ${freeAfterError}；再次启动后管理员 ${rows.length} 个，沿用同一个文件与密码 ${ok}`,
      );
      expect(first.status).toBe('rejected');
      expect(freeAfterError).toBe(true);
      expect(ok).toBe(true);
    },
    TIMEOUT_MS,
  );
});
