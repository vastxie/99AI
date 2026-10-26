import { createHash } from 'node:crypto';
import { DataSource, DataSourceOptions, QueryRunner } from 'typeorm';
import { resolveDatabaseEntities } from './database-entities';
import {
  assertCurrentSchemaManifest,
  DATABASE_BASELINE_VERSION,
  schemaFingerprint,
} from './schema-manifest';

/**
 * find 系查询与 update / delete 等写入的普通对象条件遇到 null / undefined 直接报错（TypeORM 1.x 默认值）：
 * 忽略空值会让条件变宽、命中任意行。匹配 SQL NULL 用 IsNull()，可选筛选条件有值时才拼进 where；
 * QueryBuilder 的 where / andWhere / orWhere 与作为写入条件的实体实例不经过这项检查（空值渲染成 `= NULL`），需自行判空。
 */
export const INVALID_WHERE_VALUES_BEHAVIOR = { null: 'throw', undefined: 'throw' } as const;

export async function databaseOptions(): Promise<DataSourceOptions> {
  return {
    type: 'mysql',
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT || 3306),
    username: process.env.DB_USER,
    password: process.env.DB_PASS,
    database: process.env.DB_DATABASE,
    entities: await resolveDatabaseEntities(),
    synchronize: false,
    migrationsRun: false,
    dropSchema: false,
    logging: false,
    charset: 'utf8mb4',
    timezone: '+08:00',
    invalidWhereValuesBehavior: INVALID_WHERE_VALUES_BEHAVIOR,
  };
}

async function assertDatabaseCharset(runner: QueryRunner): Promise<void> {
  const rows = await runner.query(
    'SELECT DEFAULT_CHARACTER_SET_NAME AS charset FROM information_schema.SCHEMATA WHERE SCHEMA_NAME = DATABASE()',
  );
  if (rows[0]?.charset !== 'utf8mb4') throw new Error('数据库必须使用 utf8mb4 字符集。');
  const mismatches = await runner.query(
    'SELECT TABLE_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND CHARACTER_SET_NAME IS NOT NULL AND CHARACTER_SET_NAME <> ? LIMIT 1',
    ['utf8mb4'],
  );
  if (mismatches.length) throw new Error('数据库列字符集存在漂移。');
}

async function currentDatabaseTableNames(runner: QueryRunner): Promise<string[]> {
  const tables: Array<{ name: unknown }> = await runner.query(
    'SELECT TABLE_NAME AS name FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() ORDER BY TABLE_NAME',
  );
  return tables.map(table => String(table.name)).sort();
}

async function assertPhysicalSchema(source: DataSource, runner: QueryRunner): Promise<void> {
  await assertDatabaseCharset(runner);
  const tables = await currentDatabaseTableNames(runner);
  const expected = source.entityMetadatas.map(table => table.tableName).sort();
  if (JSON.stringify(tables) !== JSON.stringify(expected))
    throw new Error('数据库表集合与当前启用模块不一致。');
  const physical: Array<{ name: unknown; collation: unknown; engine: unknown }> =
    await runner.query(
      'SELECT TABLE_NAME AS name, TABLE_COLLATION AS collation, ENGINE AS engine FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE()',
    );
  if (
    physical.some(
      table =>
        !String(table.collation || '').startsWith('utf8mb4_') ||
        table.engine !==
          (source.entityMetadatas.find(meta => meta.tableName === table.name)?.engine || 'InnoDB'),
    )
  ) {
    throw new Error('数据库表字符集或引擎存在漂移。');
  }
  const drift = await source.driver.createSchemaBuilder().log();
  if (drift.upQueries.length) throw new Error('数据库实际结构存在漂移；不会自动改表。');
}

async function verifyWithRunner(source: DataSource, runner: QueryRunner): Promise<void> {
  assertCurrentSchemaManifest(source);
  const tables = await currentDatabaseTableNames(runner);
  if (!tables.includes('schema_baseline'))
    throw new Error('数据库未初始化；请对全新空库运行 db:init。');
  const rows = await runner.query('SELECT version, fingerprint FROM schema_baseline WHERE id = ?', [
    'current',
  ]);
  if (
    rows.length !== 1 ||
    Number(rows[0].version) !== DATABASE_BASELINE_VERSION ||
    rows[0].fingerprint !== schemaFingerprint(source)
  ) {
    throw new Error('数据库基线与当前启用模块不一致；不支持旧库或部分初始化。');
  }
  await assertPhysicalSchema(source, runner);
}

export async function verifyDatabaseSchema(source: DataSource): Promise<void> {
  const runner = source.createQueryRunner();
  try {
    await runner.connect();
    await verifyWithRunner(source, runner);
  } finally {
    await runner.release();
  }
}

/** DDL 不假定可回滚；只在确认空库且持有数据库锁时创建，失败不删除现场。 */
export async function initializeEmptyDatabase(source: DataSource): Promise<'created' | 'verified'> {
  assertCurrentSchemaManifest(source);
  const runner = source.createQueryRunner();
  const lock = `99agent-init-${createHash('sha256').update(String(source.options.database)).digest('hex').slice(0, 32)}`;
  let acquired = false;
  try {
    await runner.connect();
    const rows = await runner.query('SELECT GET_LOCK(?, 0) AS acquired', [lock]);
    acquired = Number(rows[0]?.acquired) === 1;
    if (!acquired) throw new Error('另一个数据库初始化正在运行。');
    const tables = await currentDatabaseTableNames(runner);
    if (tables.length) {
      await verifyWithRunner(source, runner);
      return 'verified';
    }
    await assertDatabaseCharset(runner);
    await source.synchronize(false);
    await assertPhysicalSchema(source, runner);
    await runner.query('INSERT INTO schema_baseline (id, version, fingerprint) VALUES (?, ?, ?)', [
      'current',
      DATABASE_BASELINE_VERSION,
      schemaFingerprint(source),
    ]);
    await verifyWithRunner(source, runner);
    return 'created';
  } finally {
    try {
      if (acquired) await runner.query('SELECT RELEASE_LOCK(?)', [lock]);
    } finally {
      await runner.release();
    }
  }
}

export async function openVerifiedDatabase(options: DataSourceOptions): Promise<DataSource> {
  const source = new DataSource({
    ...options,
    synchronize: false,
    migrationsRun: false,
    dropSchema: false,
  } as DataSourceOptions);
  try {
    await source.initialize();
    await verifyDatabaseSchema(source);
    return source;
  } catch {
    if (source.isInitialized) await source.destroy();
    throw new Error('数据库连接或结构校验失败；请先检查当前空库初始化基线。');
  }
}
