import { HttpException } from '@nestjs/common';
import { GlobalConfigRegistry } from './global-config.registry';
import { GlobalConfigService } from './globalConfig.service';

declare const beforeEach: any;
declare const describe: any;
declare const expect: any;
declare const it: any;
declare const jest: any;

describe('GlobalConfigService', () => {
  let configEntity: any;
  let registry: GlobalConfigRegistry;
  let service: GlobalConfigService;

  beforeEach(() => {
    configEntity = {
      find: jest.fn().mockResolvedValue([]),
      findOne: jest.fn(),
      manager: {
        transaction: jest.fn(async (work: (manager: any) => Promise<void>) =>
          work({ findOne: jest.fn(), update: jest.fn(), save: jest.fn() }),
        ),
      },
    };
    registry = new GlobalConfigRegistry();
    service = new GlobalConfigService(configEntity, { del: jest.fn() } as any, registry);
  });

  it('projects only kernel keys plus the keys registered by loaded packs', async () => {
    registry.register({ name: 'demo-section', frontKeys: ['demoSwitch'] });
    configEntity.find.mockImplementation(async ({ where }: any) => {
      const allowed: string[] = where.configKey._value;
      return [
        { configKey: 'siteName', configVal: '99Agent' },
        { configKey: 'demoSwitch', configVal: '1' },
        { configKey: 'demoChannelStatus', configVal: '1' },
        { configKey: 'demoAppSecret', configVal: 'secret' },
      ].filter(row => allowed.includes(row.configKey));
    });

    const result = await service.queryFrontConfig({}, {});

    expect(result).toEqual({ siteName: '99Agent', demoSwitch: '1' });
  });

  it('keeps generic configuration reads available to other services', async () => {
    configEntity.find.mockResolvedValue([
      { configKey: 'siteName', configVal: '99Agent' },
      { configKey: 'maxInputLength', configVal: '4000' },
    ]);
    await service.initGetAllConfig();

    await expect(service.getConfigs(['siteName', 'maxInputLength'])).resolves.toEqual({
      siteName: '99Agent',
      maxInputLength: '4000',
    });
    await expect(service.getConfigs(['siteName'])).resolves.toBe('99Agent');
  });

  it('resolves config, then environment, then the fallback', async () => {
    configEntity.find.mockResolvedValue([{ configKey: 'demoApiUrl', configVal: 'https://db' }]);
    await service.initGetAllConfig();
    process.env.TEST_FALLBACK_URL = 'https://env';

    try {
      await expect(
        service.getConfigWithFallback('demoApiUrl', 'TEST_FALLBACK_URL', 'https://default'),
      ).resolves.toBe('https://db');
      await expect(
        service.getConfigWithFallback('missing', 'TEST_FALLBACK_URL', 'https://default'),
      ).resolves.toBe('https://env');
      await expect(
        service.getConfigWithFallback('missing', undefined, 'https://default'),
      ).resolves.toBe('https://default');
    } finally {
      delete process.env.TEST_FALLBACK_URL;
    }
  });

  it('applies the DTO value rules to internal callers as well', async () => {
    await expect(
      service.setConfig({
        settings: [{ configKey: 'wechatMenuConfig', configVal: { a: 1 } }],
      } as any),
    ).rejects.toMatchObject({ status: 400 });
    await expect(
      service.setConfig({ settings: [{ configKey: 'siteName', configVal: 'x'.repeat(65536) }] }),
    ).rejects.toMatchObject({ status: 400 });
    expect(configEntity.manager.transaction).not.toHaveBeenCalled();

    const settings: any[] = [{ configKey: 'maxToolCalls', configVal: 30 }];
    await service.setConfig({ settings });
    expect(settings[0].configVal).toBe('30');
  });

  it('refuses a validator that rewrites a value into something the column cannot hold', async () => {
    registry.register({
      name: 'broken-section',
      validate: item => {
        if (item.configKey === 'demo') item.configVal = { parsed: true };
      },
    });
    await expect(
      service.setConfig({ settings: [{ configKey: 'demo', configVal: '{}' }] }),
    ).rejects.toMatchObject({ status: 400 });
    expect(configEntity.manager.transaction).not.toHaveBeenCalled();
  });

  it('lets registered sections normalize or reject values before saving', async () => {
    registry.register({
      name: 'login-providers',
      validate: item => {
        if (item.configKey === 'callbackUrl') item.configVal = String(item.configVal).trim();
        if (item.configKey === 'flag' && item.configVal !== '1') {
          throw new HttpException('开关配置只允许保存 0 或 1', 400);
        }
      },
    });

    const settings = [{ configKey: 'callbackUrl', configVal: ' https://a.b ' }];
    await expect(service.setConfig({ settings })).resolves.toBe('设置完成！');
    expect(settings[0].configVal).toBe('https://a.b');
    expect(configEntity.manager.transaction).toHaveBeenCalledTimes(1);

    await expect(
      service.setConfig({ settings: [{ configKey: 'flag', configVal: '2' }] }),
    ).rejects.toThrow('开关配置只允许保存 0 或 1');
    expect(configEntity.manager.transaction).toHaveBeenCalledTimes(1);
  });

  it('masks secret keys declared by sections in admin queries and ignores masked values on save', async () => {
    registry.register({ name: 'demo-pay', secretKeys: ['demoAppSecret'] });
    configEntity.find.mockResolvedValue([
      { configKey: 'siteName', configVal: '99Agent' },
      { configKey: 'demoAppSecret', configVal: 'demo-secret-0123456789abcdef' },
    ]);
    await service.initGetAllConfig();

    const all = await service.queryAllConfig({} as any);
    expect(all.demoAppSecret).toBe('dem****cdef');
    expect(all.siteName).toBe('99Agent');
    const some = await service.queryConfig({ keys: ['siteName', 'demoAppSecret'] }, {} as any);
    expect(some.demoAppSecret).toBe('dem****cdef');
    await expect(service.getConfigs(['demoAppSecret'])).resolves.toBe(
      'demo-secret-0123456789abcdef',
    );

    const manager = {
      findOne: jest.fn().mockResolvedValue(null),
      update: jest.fn(),
      save: jest.fn(),
    };
    configEntity.manager.transaction.mockImplementation(async (work: any) => work(manager));
    await service.setConfig({
      settings: [
        { configKey: 'demoAppSecret', configVal: 'dem****cdef' },
        { configKey: 'siteName', configVal: 'Renamed' },
      ],
    } as any);
    expect(manager.save).toHaveBeenCalledTimes(1);
    expect(manager.save).toHaveBeenCalledWith(expect.anything(), {
      configKey: 'siteName',
      configVal: 'Renamed',
    });

    await service.setConfig({
      settings: [{ configKey: 'demoAppSecret', configVal: 'demo-secret-replaced-01' }],
    } as any);
    expect(manager.save).toHaveBeenLastCalledWith(expect.anything(), {
      configKey: 'demoAppSecret',
      configVal: 'demo-secret-replaced-01',
    });
  });

  it('notifies registered sections with the changed keys after a save', async () => {
    const onChanged = jest.fn();
    registry.register({ name: 'channel', onChanged });

    await service.setConfig({
      settings: [
        { configKey: 'demoAppId', configVal: 'id' },
        { configKey: 'siteName', configVal: '99Agent' },
      ],
    });
    await new Promise(resolve => setImmediate(resolve));

    expect(onChanged).toHaveBeenCalledWith(['demoAppId', 'siteName']);
  });

  describe('专用键与带修订号的原子写入', () => {
    /** 内存里的 config 表与 MySQL 命名锁替身：GET_LOCK 排队、RELEASE_LOCK 交给下一个等待者 */
    function fakeDatabase(initial: Array<{ id: number; configKey: string; configVal: string }>) {
      const rows = initial.map(row => ({ ...row }));
      let nextId = rows.reduce((max, row) => Math.max(max, row.id), 0) + 1;
      let holder: object | null = null;
      const waiters: Array<() => void> = [];
      const events: string[] = [];
      let lockAvailable = true;
      const readRow = (where: any, order?: any) => {
        const matched = rows.filter(row => row.configKey === where.configKey);
        matched.sort((a, b) => (order?.id === 'DESC' ? b.id - a.id : a.id - b.id));
        return matched[0] ?? null;
      };
      const createQueryRunner = () => {
        const runner: any = {};
        let pending: Array<() => void> = [];
        runner.connect = jest.fn(async () => undefined);
        runner.query = jest.fn(async (sql: string) => {
          if (sql.startsWith('SELECT GET_LOCK')) {
            if (!lockAvailable) return [{ acquired: 0 }];
            if (holder) await new Promise<void>(resolve => waiters.push(resolve));
            holder = runner;
            events.push('lock');
            return [{ acquired: 1 }];
          }
          if (sql.startsWith('SELECT RELEASE_LOCK')) {
            events.push('unlock');
            holder = null;
            waiters.shift()?.();
            return [{ released: 1 }];
          }
          throw new Error('unexpected sql');
        });
        runner.startTransaction = jest.fn(async () => {
          pending = [];
        });
        runner.commitTransaction = jest.fn(async () => {
          for (const apply of pending) apply();
          pending = [];
          events.push('commit');
        });
        runner.rollbackTransaction = jest.fn(async () => {
          pending = [];
          events.push('rollback');
        });
        runner.release = jest.fn(async () => {
          events.push('release');
        });
        runner.manager = {
          getRepository: () => ({
            findOne: async ({ where, order }: any) => readRow(where, order),
          }),
          save: async (_entity: any, value: any) => {
            pending.push(() => rows.push({ id: nextId++, ...value }));
          },
          update: async (_entity: any, where: any, value: any) => {
            pending.push(() => {
              for (const row of rows)
                if (row.configKey === where.configKey) Object.assign(row, value);
            });
          },
        };
        return runner;
      };
      return {
        rows,
        events,
        createQueryRunner,
        readRow,
        blockLock: () => {
          lockAvailable = false;
        },
      };
    }

    function serviceWith(db: ReturnType<typeof fakeDatabase>) {
      configEntity.find.mockImplementation(async () => [...db.rows].sort((a, b) => a.id - b.id));
      configEntity.findOne = jest.fn(async ({ where, order }: any) => db.readRow(where, order));
      configEntity.manager.dataSource = { createQueryRunner: db.createQueryRunner };
      if (!registry.listSections().includes('dedicated-demo')) {
        registry.register({ name: 'dedicated-demo', dedicatedKeys: ['demoTable'] });
      }
      return service;
    }

    it('通用 setConfig 拒绝专用键', async () => {
      registry.register({ name: 'dedicated-only', dedicatedKeys: ['demoTable'] });
      await expect(
        service.setConfig({ settings: [{ configKey: 'demoTable', configVal: '{}' }] } as any),
      ).rejects.toMatchObject({ status: 400 });
    });

    it('修订号：没有行为 none；多行时 id 最大的一行生效，缓存与读取一致', async () => {
      const db = fakeDatabase([
        { id: 1, configKey: 'demoTable', configVal: 'old' },
        { id: 2, configKey: 'demoTable', configVal: 'new' },
      ]);
      serviceWith(db);
      expect(GlobalConfigService.revisionOf(null)).toBe('none');
      await expect(service.readStoredValue('demoTable')).resolves.toBe('new');
      await service.initGetAllConfig();
      await expect(service.getConfigs(['demoTable'])).resolves.toBe('new');
    });

    it('同一修订号并发保存只有一个成功；首次没有行时并发插入也只有一个成功', async () => {
      for (const initial of [[{ id: 1, configKey: 'demoTable', configVal: 'v0' }], []]) {
        const db = fakeDatabase(initial);
        serviceWith(db);
        const revision = GlobalConfigService.revisionOf(initial[0]?.configVal ?? null);
        const results = await Promise.allSettled([
          service.compareAndSetConfig('demoTable', revision, () => 'from-a'),
          service.compareAndSetConfig('demoTable', revision, () => 'from-b'),
        ]);
        expect(results.map(result => result.status).sort()).toEqual(['fulfilled', 'rejected']);
        const rejected = results.find(result => result.status === 'rejected') as any;
        expect(rejected.reason).toMatchObject({ status: 409 });
        expect(db.rows.filter(row => row.configKey === 'demoTable')).toHaveLength(1);
      }
    });

    it('build 拿锁内读到的数据库值；返回新修订号并重载缓存', async () => {
      const db = fakeDatabase([{ id: 1, configKey: 'demoTable', configVal: 'db-value' }]);
      serviceWith(db);
      const build = jest.fn((current: string | null) => `${current}+1`);
      const { revision } = await service.compareAndSetConfig(
        'demoTable',
        GlobalConfigService.revisionOf('db-value'),
        build,
      );
      expect(build).toHaveBeenCalledWith('db-value');
      expect(revision).toBe(GlobalConfigService.revisionOf('db-value+1'));
      await expect(service.getConfigs(['demoTable'])).resolves.toBe('db-value+1');
      expect(db.events).toEqual(['lock', 'commit', 'unlock', 'release']);
    });

    it('build 抛错、校验不过、值含脱敏占位：回滚，锁与连接都释放，下一次照常', async () => {
      const db = fakeDatabase([{ id: 1, configKey: 'demoTable', configVal: 'v0' }]);
      serviceWith(db);
      registry.register({
        name: 'demo-validator',
        validate: item => {
          if (item.configKey === 'demoTable' && item.configVal === 'invalid') {
            throw new HttpException('非法', 400);
          }
        },
      });
      const rev = GlobalConfigService.revisionOf('v0');
      await expect(
        service.compareAndSetConfig('demoTable', rev, () => {
          throw new HttpException('冲突', 409);
        }),
      ).rejects.toMatchObject({ status: 409 });
      await expect(
        service.compareAndSetConfig('demoTable', rev, () => 'invalid'),
      ).rejects.toMatchObject({
        status: 400,
      });
      await expect(
        service.compareAndSetConfig('demoTable', rev, () => 'abc****wxyz'),
      ).rejects.toMatchObject({ status: 400 });
      expect(db.events.filter(event => event === 'rollback')).toHaveLength(3);
      expect(db.events.filter(event => event === 'unlock')).toHaveLength(3);
      expect(db.events.filter(event => event === 'release')).toHaveLength(3);
      await expect(service.compareAndSetConfig('demoTable', rev, () => 'ok')).resolves.toEqual({
        revision: GlobalConfigService.revisionOf('ok'),
      });
    });

    it('取不到锁：受控 503，文案保留', async () => {
      const db = fakeDatabase([]);
      serviceWith(db);
      db.blockLock();
      const error: any = await service
        .compareAndSetConfig('demoTable', 'none', () => 'x')
        .catch(caught => caught);
      expect(error).toMatchObject({ status: 503, controlled: true });
      expect(error.message).toBe('配置正忙，请稍后重试');
      expect(db.events).toEqual(['release']);
    });

    it('旧的缓存重载晚到不覆盖新的；读取等到全部写入结束', async () => {
      const db = fakeDatabase([{ id: 1, configKey: 'demoTable', configVal: 'v1' }]);
      serviceWith(db);
      let releaseFirst!: () => void;
      configEntity.find
        .mockImplementationOnce(
          () =>
            new Promise(resolve => {
              releaseFirst = () => resolve([{ id: 1, configKey: 'demoTable', configVal: 'stale' }]);
            }),
        )
        .mockImplementationOnce(async () => [
          { id: 1, configKey: 'demoTable', configVal: 'fresh' },
        ]);
      const first = service.initGetAllConfig();
      await service.initGetAllConfig();
      releaseFirst();
      await first;
      await expect(service.getConfigs(['demoTable'])).resolves.toBe('fresh');

      // 普通保存与原子写入交错：读取等到两者都结束
      configEntity.find.mockImplementation(async () => [...db.rows]);
      let finishBuild!: () => void;
      const cas = service.compareAndSetConfig(
        'demoTable',
        GlobalConfigService.revisionOf('v1'),
        () => new Promise<string>(resolve => (finishBuild = () => resolve('v2'))),
      );
      let finishSave!: () => void;
      const saveStarted = new Promise<void>(started => {
        configEntity.manager.transaction.mockImplementationOnce(async (work: any) => {
          started();
          await new Promise<void>(resolve => (finishSave = resolve));
          return work({ findOne: jest.fn(), update: jest.fn(), save: jest.fn() });
        });
      });
      const save = service.setConfig({ settings: [{ configKey: 'siteName', configVal: 'x' }] });
      await saveStarted;
      let read = false;
      const reading = service.getConfigs(['demoTable']).then(value => {
        read = true;
        return value;
      });
      await new Promise(resolve => setTimeout(resolve, 30));
      expect(read).toBe(false);
      finishBuild();
      await cas;
      // 原子写入已结束，普通保存还在事务里：读取继续等
      await new Promise(resolve => setTimeout(resolve, 30));
      expect(read).toBe(false);
      finishSave();
      await save;
      await expect(reading).resolves.toBe('v2');
    });
  });

  describe('键名只差大小写', () => {
    it('与已登记的键只差大小写：拒绝（专用键、密钥类键带脱敏值、前台键、默认值键、内核前台键），不进事务', async () => {
      registry.register({
        name: 'case-demo',
        frontKeys: ['demoFront'],
        secretKeys: ['demoAppSecret'],
        dedicatedKeys: ['demoTable'],
        defaults: [{ key: 'demoDefault', value: '1' }],
      });
      const cases: Array<[string, string, string]> = [
        ['DemoTable', '{}', '配置项 DemoTable 应写作 demoTable'],
        ['demoappsecret', 'dem****cdef', '配置项 demoappsecret 应写作 demoAppSecret'],
        ['DemoFront', 'x', '配置项 DemoFront 应写作 demoFront'],
        ['DEMODEFAULT', '0', '配置项 DEMODEFAULT 应写作 demoDefault'],
        ['SiteName', 'x', '配置项 SiteName 应写作 siteName'],
      ];
      for (const [configKey, configVal, message] of cases) {
        await expect(service.setConfig({ settings: [{ configKey, configVal }] })).rejects.toThrow(
          message,
        );
      }
      await expect(
        service.prepareSettings([{ configKey: 'DemoTable', configVal: '{}' }]),
      ).rejects.toMatchObject({ status: 400 });
      expect(configEntity.manager.transaction).not.toHaveBeenCalled();
    });

    it('与数据库里已有的键只差大小写、或同一次提交里两个键只差大小写：拒绝；原名照常保存', async () => {
      // 模拟 MySQL 的 _ci 排序规则：按键名查找不区分大小写
      const rows = [{ id: 1, configKey: 'customFlag', configVal: '1' }];
      configEntity.find.mockImplementation(async ({ where }: any = {}) => {
        if (!where) return rows;
        const keys = where.configKey.value.map((key: string) => key.toLowerCase());
        return rows.filter(row => keys.includes(row.configKey.toLowerCase()));
      });
      await expect(
        service.setConfig({ settings: [{ configKey: 'CustomFlag', configVal: '0' }] }),
      ).rejects.toThrow('配置项 CustomFlag 与已有的 customFlag 只差大小写，请使用原名');
      await expect(
        service.setConfig({
          settings: [
            { configKey: 'otherFlag', configVal: '0' },
            { configKey: 'OtherFlag', configVal: '1' },
          ],
        }),
      ).rejects.toThrow('配置项 OtherFlag 与 otherFlag 只差大小写，请只保留一个');
      expect(configEntity.manager.transaction).not.toHaveBeenCalled();
      await expect(
        service.setConfig({ settings: [{ configKey: 'customFlag', configVal: '0' }] }),
      ).resolves.toBe('设置完成！');
    });

    it('checkConfigValue：类型与大小、校验器、脱敏占位，与原子写入锁内的检查相同', async () => {
      registry.register({
        name: 'check-demo',
        validate: item => {
          if (item.configKey === 'demoTable' && item.configVal === 'bad') {
            throw new HttpException('demoTable 不合法', 400);
          }
        },
      });
      await expect(service.checkConfigValue('demoTable', 30)).resolves.toBe('30');
      await expect(service.checkConfigValue('demoTable', 'bad')).rejects.toThrow(
        'demoTable 不合法',
      );
      await expect(service.checkConfigValue('demoTable', 'abc****wxyz')).rejects.toThrow(
        '配置里不能包含脱敏占位，请重新填写密钥',
      );
      await expect(service.checkConfigValue('demoTable', 'x'.repeat(65536))).rejects.toMatchObject({
        status: 400,
      });
    });
  });
});
