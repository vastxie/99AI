import { DataSource } from 'typeorm';
import { DatabaseBaselineEntity } from './database-baseline.entity';
import { UserEntity } from '../user/user.entity';
import { initializeEmptyDatabase, verifyDatabaseSchema } from './database-schema';

declare const describe: any;
declare const it: any;
declare const expect: any;
declare const jest: any;

async function fixture() {
  const source = new DataSource({
    type: 'mysql',
    database: 'offline_fixture',
    entities: [DatabaseBaselineEntity, UserEntity],
    synchronize: false,
  });
  await (source as any).buildMetadatas();
  const state = {
    charset: 'utf8mb4',
    tables: [] as string[],
    baseline: [] as any[],
    lock: 1,
    drift: false,
    partial: false,
  };
  const calls: string[] = [];
  const runner = {
    connect: jest.fn(async (): Promise<void> => undefined),
    release: jest.fn(async (): Promise<void> => undefined),
    getTables: jest.fn(async () => {
      throw new Error('Cross-schema table discovery must not be used');
    }),
    query: jest.fn(async (sql: string, params: any[]) => {
      calls.push(sql);
      if (sql.startsWith('SELECT GET_LOCK')) return [{ acquired: state.lock }];
      if (sql.startsWith('SELECT RELEASE_LOCK')) return [];
      if (sql.includes('information_schema.SCHEMATA')) return [{ charset: state.charset }];
      if (sql.includes('information_schema.COLUMNS')) return [];
      if (sql.startsWith('SELECT TABLE_NAME AS name FROM information_schema.TABLES')) {
        expect(sql).toContain('WHERE TABLE_SCHEMA = DATABASE()');
        return state.tables.map(name => ({ name }));
      }
      if (sql.includes('information_schema.TABLES'))
        return state.tables.map(name => ({
          name,
          collation: 'utf8mb4_unicode_ci',
          engine: 'InnoDB',
        }));
      if (sql.startsWith('SELECT version')) return state.baseline;
      if (sql.startsWith('INSERT INTO schema_baseline')) {
        state.baseline = [{ version: params[1], fingerprint: params[2] }];
        return [];
      }
      throw new Error('Unexpected SQL in schema test');
    }),
  };
  source.createQueryRunner = () => runner as any;
  source.synchronize = jest.fn(async () => {
    calls.push('DDL');
    state.tables = source.entityMetadatas.map(table => table.tableName);
    if (state.partial) {
      state.tables = ['schema_baseline'];
      throw new Error('Synthetic DDL interruption');
    }
  });
  source.driver.createSchemaBuilder = () =>
    ({
      log: async () => ({
        upQueries: state.drift ? [{ query: 'ALTER TABLE fixture' }] : [],
        downQueries: [] as Array<{ query: string }>,
      }),
    }) as any;
  return { source, state, calls, runner };
}

describe('explicit empty database initialization', () => {
  it('rejects an incompatible database character set before creating tables', async () => {
    const f = await fixture();
    f.state.charset = 'latin1';
    await expect(initializeEmptyDatabase(f.source)).rejects.toThrow('utf8mb4');
    expect(f.source.synchronize).not.toHaveBeenCalled();
  });
  it('creates only after the empty check under the lock, marks last, and repeats as read-only verification', async () => {
    const f = await fixture();
    expect(await initializeEmptyDatabase(f.source)).toBe('created');
    expect(f.calls.indexOf('DDL')).toBeGreaterThan(
      f.calls.findIndex(call => call.startsWith('SELECT TABLE_NAME AS name')),
    );
    expect(f.calls.findIndex(call => call.startsWith('INSERT'))).toBeGreaterThan(
      f.calls.indexOf('DDL'),
    );
    expect(f.calls[0]).toContain('GET_LOCK');
    expect(f.calls.at(-1)).toContain('RELEASE_LOCK');
    expect(await initializeEmptyDatabase(f.source)).toBe('verified');
    expect(f.source.synchronize).toHaveBeenCalledTimes(1);
    await verifyDatabaseSchema(f.source);
    expect(f.runner.release).toHaveBeenCalledTimes(3);
    expect(f.runner.getTables).not.toHaveBeenCalled();
  });

  it('ignores tables visible in other schemas when checking whether the target is empty', async () => {
    const f = await fixture();
    f.runner.getTables.mockResolvedValue([
      { name: 'aiweb.users', database: 'aiweb' },
      { name: 'information_schema.TABLES', database: 'information_schema' },
    ]);
    expect(await initializeEmptyDatabase(f.source)).toBe('created');
    expect(f.runner.getTables).not.toHaveBeenCalled();
  });

  it.each([['users'], ['schema_baseline'], ['unrelated_table']])(
    'refuses a nonempty or partially initialized database: %s',
    async (name: string) => {
      const f = await fixture();
      f.state.tables = [name];
      await expect(initializeEmptyDatabase(f.source)).rejects.toThrow();
      expect(f.source.synchronize).not.toHaveBeenCalled();
      expect(f.calls.some(call => call.startsWith('INSERT'))).toBe(false);
      expect(f.calls.at(-1)).toContain('RELEASE_LOCK');
    },
  );

  it('leaves failed DDL unmarked and never deletes or silently resumes the partial schema', async () => {
    const f = await fixture();
    f.state.partial = true;
    await expect(initializeEmptyDatabase(f.source)).rejects.toThrow('Synthetic');
    expect(f.state.baseline).toEqual([]);
    await expect(initializeEmptyDatabase(f.source)).rejects.toThrow();
    expect(f.source.synchronize).toHaveBeenCalledTimes(1);
    expect(f.calls.some(call => /DROP|DELETE/.test(call))).toBe(false);
  });

  it('refuses concurrent initialization without reading or changing schema', async () => {
    const f = await fixture();
    f.state.lock = 0;
    await expect(initializeEmptyDatabase(f.source)).rejects.toThrow('另一个');
    expect(f.runner.getTables).not.toHaveBeenCalled();
    expect(f.source.synchronize).not.toHaveBeenCalled();
    expect(f.runner.release).toHaveBeenCalledTimes(1);
  });

  it.each(['fingerprint', 'table', 'column', 'physical'])(
    'rejects %s drift without executing a schema patch',
    async (mode: string) => {
      const f = await fixture();
      await initializeEmptyDatabase(f.source);
      if (mode === 'fingerprint') f.state.baseline[0].fingerprint = 'mismatch';
      if (mode === 'table') f.state.tables.push('unexpected');
      if (mode === 'column')
        f.source.entityMetadatas[0].columns[0].isNullable =
          !f.source.entityMetadatas[0].columns[0].isNullable;
      if (mode === 'physical') f.state.drift = true;
      await expect(verifyDatabaseSchema(f.source)).rejects.toThrow();
      expect(f.source.synchronize).toHaveBeenCalledTimes(1);
      expect(f.calls.some(call => call.startsWith('ALTER'))).toBe(false);
    },
  );
});
