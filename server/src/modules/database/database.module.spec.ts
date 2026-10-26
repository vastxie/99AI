import { Logger } from '@nestjs/common';
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { DatabaseModule } from './database.module';
import { databaseOptions } from './database-schema';
import { configureDatabaseRoot, resolveDatabaseEntities } from './database-entities';
import { UserEntity } from '../user/user.entity';
import { ModelsEntity } from '../models/models.entity';
import { DatabaseBaselineEntity } from './database-baseline.entity';

declare const describe: any;
declare const expect: any;
declare const it: any;
declare const jest: any;

@Module({ imports: [TypeOrmModule.forFeature([ModelsEntity])] })
class DisabledModule {}
@Module({ imports: [TypeOrmModule.forFeature([UserEntity])] })
class EnabledModule {}
@Module({ imports: [EnabledModule] })
class Root {}

describe('current database composition', () => {
  it('collects repositories only from the actual module graph even after disabled modules were evaluated', async () => {
    expect(DisabledModule).toBeDefined();
    const entities = await resolveDatabaseEntities(Root);
    expect(entities).toEqual(expect.arrayContaining([UserEntity, DatabaseBaselineEntity]));
    expect(entities).not.toContain(ModelsEntity);
    const source = new DataSource({ type: 'mysql', database: 'offline', entities });
    await (source as any).buildMetadatas();
    expect(source.entityMetadatas).toHaveLength(2);
  });

  it('keeps normal startup read-only for schema regardless of removed environment flags', async () => {
    configureDatabaseRoot(Root);
    const previous = process.env.DB_SYNC;
    try {
      process.env.DB_SYNC = 'true';
      expect(await databaseOptions()).toMatchObject({
        synchronize: false,
        migrationsRun: false,
        dropSchema: false,
      });
    } finally {
      if (previous === undefined) delete process.env.DB_SYNC;
      else process.env.DB_SYNC = previous;
    }
  });

  it('rejects null / undefined where values for reads and writes alike', async () => {
    configureDatabaseRoot(Root);
    expect((await databaseOptions()).invalidWhereValuesBehavior).toEqual({
      null: 'throw',
      undefined: 'throw',
    });
  });

  it('logs only a static verified status on module initialization', () => {
    const log = jest.spyOn(Logger, 'log').mockImplementation((): void => undefined);
    try {
      new DatabaseModule().onModuleInit();
      expect(log).toHaveBeenCalledWith(
        'MySQL 已连接，当前结构基线校验通过，自动改表已禁用。',
        'DatabaseModule',
      );
    } finally {
      log.mockRestore();
    }
  });
});
