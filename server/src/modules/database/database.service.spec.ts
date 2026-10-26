import { Logger } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  DatabaseService,
  formatInitialPasswordFile,
  parseInitialPasswordFile,
  resolveInitialAdminPassword,
} from './database.service';

declare const afterEach: any;
declare const beforeEach: any;
declare const describe: any;
declare const expect: any;
declare const it: any;
declare const jest: any;

describe('DatabaseService SQL safety', () => {
  let loggerLogSpy: any;

  beforeEach(() => {
    loggerLogSpy = jest.spyOn(Logger, 'log').mockImplementation((): void => undefined);
  });

  afterEach(() => {
    loggerLogSpy.mockRestore();
  });

  const createService = () => {
    const connection = {
      query: jest.fn(),
    };

    return {
      connection,
      service: new DatabaseService(connection as any),
    };
  };

  it('checks base config with parameterized IN values', async () => {
    const { connection, service } = createService();
    connection.query.mockResolvedValueOnce([{ count: '1' }]);

    await service.checkSiteBaseConfig();

    expect(connection.query).toHaveBeenCalledWith(
      'SELECT COUNT(*) AS count FROM config WHERE `configKey` IN (?)',
      ['siteName'],
    );
  });

  it('creates base site config with parameterized batch insert values', async () => {
    const { connection, service } = createService();
    connection.query.mockResolvedValueOnce(undefined);

    await service.createBaseSiteConfig();

    const [sql, params] = connection.query.mock.calls[0];
    expect(sql).toMatch(/^INSERT INTO config \(configKey, configVal, public, encrypt\) VALUES /);
    expect(sql).toContain('(?, ?, ?, ?)');
    expect(sql).not.toContain('noticeInfo');
    expect(sql).not.toContain('欢迎使用 99Agent');
    expect(params).toEqual(
      expect.arrayContaining([
        'siteName',
        'noticeInfo',
        expect.stringContaining('#### 欢迎使用 99Agent'),
      ]),
    );
    expect(params.join(' ')).not.toContain('123456');
    expect(params.length).toBe(8);
  });
});

const SERVER_UUID = '3e11fa47-71ca-11e1-9e33-c80aa9429562';
const OTHER_SERVER_UUID = '9b2d6c1e-0f4a-11ef-8a51-0242ac120002';
const STORAGE_ID = 'stor_AbCdEfGhJkMnPqRsTu';
const FILE_PASSWORD = 'AbCdEfGhJkMnPqRs';

type FakeDb = {
  server: string | null;
  database: string | null;
  supers: Array<{ storageId: string; hash: string }>;
  inserts: unknown[][];
  events: string[];
  lockHolder: unknown;
  lockWaiters: Array<() => void>;
  getLock?: () => Promise<unknown>;
  insert?: (params: any[]) => Promise<unknown>;
  recheck?: (params: any[]) => Promise<unknown[]>;
};

const createFakeDb = (overrides: Partial<FakeDb> = {}): FakeDb => ({
  server: SERVER_UUID,
  database: 'agent_db',
  supers: [],
  inserts: [],
  events: [],
  lockHolder: null,
  lockWaiters: [],
  ...overrides,
});

/** 只认 DatabaseService 初始化超级管理员用到的几条 SQL；命名锁按调用方（连接）排队 */
const route = async (db: FakeDb, runner: unknown, sql: string, params: any[] = []) => {
  if (sql.startsWith('SELECT GET_LOCK')) {
    db.events.push('get_lock');
    if (db.getLock) return [{ locked: await db.getLock() }];
    while (db.lockHolder && db.lockHolder !== runner) {
      await new Promise<void>(resolve => db.lockWaiters.push(resolve));
    }
    db.lockHolder = runner;
    return [{ locked: 1 }];
  }
  if (sql.startsWith('SELECT RELEASE_LOCK')) {
    db.events.push('release_lock');
    if (db.lockHolder === runner) {
      db.lockHolder = null;
      db.lockWaiters.splice(0).forEach(wake => wake());
    }
    return [{ released: 1 }];
  }
  if (sql.startsWith("SELECT id FROM users WHERE role = 'super'")) {
    return db.supers.length ? [{ id: 1 }] : [];
  }
  if (sql.startsWith('SELECT @@server_uuid')) return [{ server: db.server, name: db.database }];
  if (sql.startsWith('INSERT INTO users')) {
    db.events.push('insert');
    db.inserts.push(params);
    if (db.insert) return db.insert(params);
    db.supers.push({ storageId: params[5], hash: params[1] });
    return { insertId: 1 };
  }
  if (sql.startsWith('SELECT id FROM users WHERE storageId')) {
    if (db.recheck) return db.recheck(params);
    return db.supers.some(item => item.storageId === params[0]) ? [{ id: 1 }] : [];
  }
  throw new Error(`unexpected SQL: ${sql}`);
};

const createInitService = (db: FakeDb) => {
  const runners: any[] = [];
  const dataSource = {
    query: jest.fn((sql: string, params?: any[]) => route(db, dataSource, sql, params)),
    createQueryRunner: jest.fn(() => {
      const runner: any = {};
      runner.connect = jest.fn(async () => undefined);
      runner.release = jest.fn(async () => undefined);
      runner.query = jest.fn((sql: string, params?: any[]) => route(db, runner, sql, params));
      runners.push(runner);
      return runner;
    }),
  };
  return { service: new DatabaseService(dataSource as any), dataSource, runners };
};

describe('DatabaseService super admin initialization', () => {
  let dir: string;
  let file: string;
  let env: NodeJS.ProcessEnv;
  let logs: string[];

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), '99agent-init-admin-'));
    file = path.join(dir, 'initial-admin-password.txt');
    env = { ADMIN_INITIAL_PASSWORD_FILE: file };
    logs = [];
    for (const level of ['log', 'warn', 'error'] as const) {
      jest.spyOn(Logger, level).mockImplementation((...args: unknown[]) => {
        logs.push(args.map(String).join(' '));
      });
    }
  });

  afterEach(() => {
    jest.restoreAllMocks();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  const writeOwnedFile = (content: string, target = file, mode = 0o600): string => {
    fs.writeFileSync(target, content, { mode });
    fs.chmodSync(target, mode);
    return content;
  };
  const validFile = (overrides: Record<string, unknown> = {}) =>
    formatInitialPasswordFile({
      password: FILE_PASSWORD,
      server: SERVER_UUID,
      database: 'agent_db',
      storageId: STORAGE_ID,
      ...overrides,
    } as any);
  const expectReleased = (db: FakeDb, runners: any[]) => {
    expect(db.lockHolder).toBeNull();
    for (const runner of runners) expect(runner.release).toHaveBeenCalledTimes(1);
  };

  it('does nothing when a super admin already exists', async () => {
    const db = createFakeDb({ supers: [{ storageId: STORAGE_ID, hash: 'x' }] });
    const { service, dataSource } = createInitService(db);

    await service.checkSuperAdmin(env);

    expect(dataSource.createQueryRunner).not.toHaveBeenCalled();
    expect(db.inserts).toEqual([]);
    expect(fs.existsSync(file)).toBe(false);
  });

  it('creates the admin from ADMIN_INITIAL_PASSWORD inside the lock without writing a file', async () => {
    const db = createFakeDb();
    const { service, runners } = createInitService(db);

    await service.checkSuperAdmin({ ...env, ADMIN_INITIAL_PASSWORD: 'unit-test-initial-pass' });

    expect(db.events).toEqual(['get_lock', 'insert', 'release_lock']);
    expect(db.inserts).toEqual([
      [
        'super',
        expect.any(String),
        1,
        null,
        'super',
        expect.stringMatching(/^stor_[0-9A-Za-z]{18}$/),
      ],
    ]);
    expect(bcrypt.compareSync('unit-test-initial-pass', db.supers[0].hash)).toBe(true);
    expect(fs.existsSync(file)).toBe(false);
    expect(logs.join(' ')).not.toContain('unit-test-initial-pass');
    expectReleased(db, runners);
  });

  it('accepts configured passwords of 8 to 30 characters only', async () => {
    expect(() => resolveInitialAdminPassword({ ADMIN_INITIAL_PASSWORD: 'a'.repeat(7) })).toThrow(
      'ADMIN_INITIAL_PASSWORD',
    );
    expect(() => resolveInitialAdminPassword({ ADMIN_INITIAL_PASSWORD: 'a'.repeat(31) })).toThrow(
      'ADMIN_INITIAL_PASSWORD',
    );
    expect(resolveInitialAdminPassword({ ADMIN_INITIAL_PASSWORD: 'a'.repeat(8) }).source).toBe(
      'env',
    );
    expect(resolveInitialAdminPassword({ ADMIN_INITIAL_PASSWORD: 'a'.repeat(30) }).source).toBe(
      'env',
    );
    expect(resolveInitialAdminPassword({}).source).toBe('generated');
    // 与登录 DTO 同样计数：表情（两个 UTF-16 单元）、带变体选择符的符号都只算 1 个字符
    expect(resolveInitialAdminPassword({ ADMIN_INITIAL_PASSWORD: '😀'.repeat(16) }).source).toBe(
      'env',
    );
    expect(() => resolveInitialAdminPassword({ ADMIN_INITIAL_PASSWORD: '😀'.repeat(4) })).toThrow(
      'ADMIN_INITIAL_PASSWORD',
    );
    expect(() =>
      resolveInitialAdminPassword({ ADMIN_INITIAL_PASSWORD: '\u263A\uFE0F'.repeat(7) }),
    ).toThrow('ADMIN_INITIAL_PASSWORD');
    expect(
      resolveInitialAdminPassword({ ADMIN_INITIAL_PASSWORD: '\u263A\uFE0F'.repeat(8) }).source,
    ).toBe('env');
    expect(() => resolveInitialAdminPassword({ ADMIN_INITIAL_PASSWORD: '😀'.repeat(31) })).toThrow(
      'ADMIN_INITIAL_PASSWORD',
    );

    const db = createFakeDb();
    const { service, runners } = createInitService(db);
    await expect(
      service.checkSuperAdmin({ ...env, ADMIN_INITIAL_PASSWORD: 'a'.repeat(31) }),
    ).rejects.toThrow('ADMIN_INITIAL_PASSWORD');
    expect(db.inserts).toEqual([]);
    expectReleased(db, runners);
  });

  it('publishes the generated password file and syncs it before inserting the admin', async () => {
    const db = createFakeDb();
    const { service, runners } = createInitService(db);
    // 被测代码与这里拿到的是同一个 fs 模块对象（import * as 得到的只是只读的转发包装）
    recordFsync(db);

    await service.checkSuperAdmin(env);

    const parsed = parseInitialPasswordFile(fs.readFileSync(file, 'utf8'));
    expect(parsed).toEqual({
      password: expect.stringMatching(/^[A-Za-z0-9]{16}$/),
      server: SERVER_UUID,
      database: 'agent_db',
      storageId: expect.stringMatching(/^stor_[0-9A-Za-z]{18}$/),
    });
    expect(db.inserts[0][5]).toBe(parsed?.storageId);
    expect(bcrypt.compareSync(parsed?.password as string, db.supers[0].hash)).toBe(true);
    expect(fs.statSync(file).mode & 0o777).toBe(0o600);
    // 文件内容与目录项都落盘之后才插入账号
    expect(db.events).toEqual(['get_lock', 'fsync_file', 'fsync_dir', 'insert', 'release_lock']);
    expect(fs.readdirSync(dir)).toEqual(['initial-admin-password.txt']);
    expect(logs.join(' ')).not.toContain(parsed?.password as string);
    expect(logs.join(' ')).not.toContain(file);
    expectReleased(db, runners);
  });

  /** 记录文件与目录的 fsync，和 SQL 事件排在同一条时间线上 */
  const recordFsync = (db: FakeDb) => {
    const nodeFs = jest.requireActual('fs') as typeof fs;
    const realFsync = nodeFs.fsyncSync;
    return jest.spyOn(nodeFs, 'fsyncSync').mockImplementation((fd: number) => {
      db.events.push(nodeFs.fstatSync(fd).isDirectory() ? 'fsync_dir' : 'fsync_file');
      return realFsync(fd);
    });
  };

  it('reuses the password file an interrupted initialization of this database left behind', async () => {
    const content = writeOwnedFile(validFile());
    const db = createFakeDb();
    const { service } = createInitService(db);
    recordFsync(db);

    await service.checkSuperAdmin(env);

    // 沿用之前先把文件与目录项同步到磁盘
    expect(db.events).toEqual(['get_lock', 'fsync_file', 'fsync_dir', 'insert', 'release_lock']);
    expect(db.inserts[0][5]).toBe(STORAGE_ID);
    expect(bcrypt.compareSync(FILE_PASSWORD, db.supers[0].hash)).toBe(true);
    expect(fs.readFileSync(file, 'utf8')).toBe(content);
  });

  it('refuses a password file it cannot prove belongs to this database', async () => {
    const valid = validFile();
    const [passwordLine, ownerLine] = valid.split('\n');
    const owner = JSON.parse(ownerLine.slice('# 99agent-init-admin '.length));
    const ownerWith = (patch: Record<string, unknown>) =>
      `${passwordLine}\n# 99agent-init-admin ${JSON.stringify({ ...owner, ...patch })}\n`;
    const cases: Array<{ name: string; content: string; mode?: number }> = [
      { name: 'another server', content: validFile({ server: OTHER_SERVER_UUID }) },
      { name: 'another database', content: validFile({ database: 'agent_db_old' }) },
      { name: 'legacy single line', content: `${FILE_PASSWORD}\n` },
      { name: 'truncated', content: `${passwordLine}\n` },
      { name: 'no trailing newline', content: valid.slice(0, -1) },
      { name: 'duplicate owner line', content: `${valid}${ownerLine}\n` },
      { name: 'bad storageId', content: ownerWith({ storageId: 'stor_short' }) },
      { name: 'extra key', content: ownerWith({ note: 'x' }) },
      { name: 'version 2', content: ownerWith({ v: 2 }) },
      { name: 'bad password', content: valid.replace(passwordLine, `${'0'.repeat(16)}`) },
      { name: 'readable by others', content: valid, mode: 0o644 },
    ];
    for (const item of cases) {
      writeOwnedFile(item.content, file, item.mode);
      const db = createFakeDb();
      const { service, runners } = createInitService(db);
      await expect(service.checkSuperAdmin(env)).rejects.toThrow('没有创建账号');
      expect({ name: item.name, inserts: db.inserts.length }).toEqual({
        name: item.name,
        inserts: 0,
      });
      expect(fs.readFileSync(file, 'utf8')).toBe(item.content);
      expectReleased(db, runners);
      fs.rmSync(file);
    }
  });

  it('refuses a password file that is a symbolic link', async () => {
    const target = path.join(dir, 'elsewhere.txt');
    writeOwnedFile(validFile(), target);
    fs.symlinkSync(target, file);
    const db = createFakeDb();
    const { service } = createInitService(db);

    await expect(service.checkSuperAdmin(env)).rejects.toThrow('符号链接');
    expect(db.inserts).toEqual([]);
  });

  it('round-trips database names with quotes, spaces and Unicode', async () => {
    const database = `agent "db" 名 'x'\\y`;
    const db = createFakeDb({ database });
    db.insert = async () => {
      throw new Error('insert failed');
    };
    const first = createInitService(db);
    await expect(first.service.checkSuperAdmin(env)).rejects.toThrow('创建超级管理员失败');
    const written = parseInitialPasswordFile(fs.readFileSync(file, 'utf8'));
    expect(written?.database).toBe(database);

    db.insert = undefined;
    const second = createInitService(db);
    await second.service.checkSuperAdmin(env);
    expect(db.inserts[1][5]).toBe(written?.storageId);
    expect(bcrypt.compareSync(written?.password as string, db.supers[0].hash)).toBe(true);
  });

  it('does not insert when the password file cannot be published, and logs no path', async () => {
    const blocker = path.join(dir, 'not-a-directory');
    fs.writeFileSync(blocker, 'x');
    const db = createFakeDb();
    const { service, runners } = createInitService(db);

    await expect(
      service.checkSuperAdmin({ ADMIN_INITIAL_PASSWORD_FILE: path.join(blocker, 'pass.txt') }),
    ).rejects.toThrow('无法写入初始管理员密码文件');
    expect(db.inserts).toEqual([]);
    expect(logs.join(' ')).not.toContain(dir);
    expectReleased(db, runners);
  });

  it('syncs a file whose directory sync failed before a later start reuses it', async () => {
    const nodeFs = jest.requireActual('fs') as typeof fs;
    const realFsync = nodeFs.fsyncSync;
    const fsync = jest.spyOn(nodeFs, 'fsyncSync').mockImplementation((fd: number) => {
      if (nodeFs.fstatSync(fd).isDirectory()) {
        throw Object.assign(new Error(`EIO: i/o error, fsync '${dir}'`), { code: 'EIO' });
      }
      return realFsync(fd);
    });
    const db = createFakeDb();
    await expect(createInitService(db).service.checkSuperAdmin(env)).rejects.toThrow(
      '无法写入初始管理员密码文件',
    );
    expect(db.inserts).toEqual([]);
    expect(logs.join(' ')).not.toContain(dir);
    const kept = parseInitialPasswordFile(fs.readFileSync(file, 'utf8'));
    expect(kept).not.toBeNull();

    // 下次启动：先把文件与目录同步，再沿用同一个密码建账号
    fsync.mockRestore();
    db.events.length = 0;
    recordFsync(db);
    await createInitService(db).service.checkSuperAdmin(env);
    expect(db.events).toEqual(['get_lock', 'fsync_file', 'fsync_dir', 'insert', 'release_lock']);
    expect(db.inserts[0][5]).toBe(kept?.storageId);
  });

  it('checks a password file that appears between the check and the publish', async () => {
    const nodeFs = jest.requireActual('fs') as typeof fs;
    const raced = (content: string) =>
      jest.spyOn(nodeFs, 'linkSync').mockImplementationOnce((_from: any, to: any) => {
        nodeFs.writeFileSync(to, content, { mode: 0o600 });
        nodeFs.chmodSync(to, 0o600);
        throw Object.assign(new Error('exists'), { code: 'EEXIST' });
      });

    raced(validFile());
    const db = createFakeDb();
    recordFsync(db);
    await createInitService(db).service.checkSuperAdmin(env);
    expect(db.inserts[0][5]).toBe(STORAGE_ID);
    // 别处写出的文件同样先同步再建账号（自己的临时文件已 fsync 过一次）
    expect(db.events.slice(-4)).toEqual(['fsync_file', 'fsync_dir', 'insert', 'release_lock']);
    expect(fs.readdirSync(dir)).toEqual(['initial-admin-password.txt']);

    fs.rmSync(file);
    raced(`${FILE_PASSWORD}\n`);
    const other = createFakeDb();
    await expect(createInitService(other).service.checkSuperAdmin(env)).rejects.toThrow(
      '不是本程序生成的格式',
    );
    expect(other.inserts).toEqual([]);
  });

  it('ignores temporary files an earlier attempt left behind', async () => {
    const stray = path.join(dir, '.initial-admin-password.txt.123.abcdef012345.tmp');
    fs.writeFileSync(stray, 'partial');
    const db = createFakeDb();

    await createInitService(db).service.checkSuperAdmin(env);

    expect(db.supers).toHaveLength(1);
    expect(fs.readFileSync(stray, 'utf8')).toBe('partial');
  });

  it('keeps the file and continues when the insert reports an error after committing', async () => {
    const db = createFakeDb();
    db.insert = async params => {
      db.supers.push({ storageId: params[5], hash: params[1] });
      throw new Error('connection lost after commit');
    };
    const { service, runners } = createInitService(db);

    await service.checkSuperAdmin(env);

    expect(parseInitialPasswordFile(fs.readFileSync(file, 'utf8'))?.storageId).toBe(
      db.supers[0].storageId,
    );
    expect(logs.join(' ')).toContain('核对确认账号已创建');
    expectReleased(db, runners);
  });

  it('keeps the file when the insert failed, and the next start uses the same password', async () => {
    const db = createFakeDb();
    db.insert = async () => {
      throw new Error('insert failed');
    };
    const first = createInitService(db);
    await expect(first.service.checkSuperAdmin(env)).rejects.toThrow('创建超级管理员失败');
    expectReleased(db, first.runners);
    const kept = fs.readFileSync(file, 'utf8');

    db.insert = undefined;
    const second = createInitService(db);
    await second.service.checkSuperAdmin(env);

    expect(fs.readFileSync(file, 'utf8')).toBe(kept);
    const parsed = parseInitialPasswordFile(kept);
    expect(db.inserts.map(params => params[5])).toEqual([parsed?.storageId, parsed?.storageId]);
    expect(bcrypt.compareSync(parsed?.password as string, db.supers[0].hash)).toBe(true);
  });

  it('keeps the file and stops when the outcome of the insert is unknown', async () => {
    const db = createFakeDb();
    db.insert = async () => {
      throw new Error('insert failed');
    };
    db.recheck = async () => {
      throw new Error('recheck failed');
    };
    const { service, runners } = createInitService(db);

    await expect(service.checkSuperAdmin(env)).rejects.toThrow('结果不确定');
    expect(parseInitialPasswordFile(fs.readFileSync(file, 'utf8'))).not.toBeNull();
    expectReleased(db, runners);
  });

  it('creates nothing when the lock is not acquired', async () => {
    for (const getLock of [
      async () => 0,
      async () => null,
      async () => {
        throw new Error('connection lost');
      },
    ]) {
      const db = createFakeDb({ getLock });
      const { service, runners } = createInitService(db);
      await expect(service.checkSuperAdmin(env)).rejects.toThrow();
      expect(db.events).toEqual(['get_lock']);
      expect(db.inserts).toEqual([]);
      expect(fs.existsSync(file)).toBe(false);
      expect(runners[0].release).toHaveBeenCalledTimes(1);
    }
  });

  it('lets only the first of two initializers create the admin; the second touches nothing', async () => {
    const db = createFakeDb();
    const fileA = path.join(dir, 'a', 'initial-admin-password.txt');
    const fileB = path.join(dir, 'b', 'initial-admin-password.txt');
    const a = createInitService(db);
    const b = createInitService(db);

    await Promise.all([
      a.service.checkSuperAdmin({ ADMIN_INITIAL_PASSWORD_FILE: fileA }),
      b.service.checkSuperAdmin({ ADMIN_INITIAL_PASSWORD_FILE: fileB }),
    ]);

    expect(db.inserts).toHaveLength(1);
    const written = [fileA, fileB].filter(item => fs.existsSync(item));
    expect(written).toHaveLength(1);
    const parsed = parseInitialPasswordFile(fs.readFileSync(written[0], 'utf8'));
    expect(bcrypt.compareSync(parsed?.password as string, db.supers[0].hash)).toBe(true);
    expectReleased(db, [...a.runners, ...b.runners]);
  });
});
