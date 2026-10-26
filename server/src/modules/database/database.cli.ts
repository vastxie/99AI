import { DataSource } from 'typeorm';
import { databaseOptions, initializeEmptyDatabase, verifyDatabaseSchema } from './database-schema';

/** db:* 整个命令空间都必须在普通应用启动前结束，拼写错误也不能启动服务。 */
export async function runRequestedDatabaseCommand(
  command: string | undefined,
): Promise<number | undefined> {
  if (!command?.startsWith('db:')) return undefined;
  return runDatabaseCli(command);
}

/** 仅数据库命令，不创建 Nest 上下文，不连接 Redis，不运行应用初始化钩子。 */
export async function runDatabaseCli(command: string): Promise<number> {
  if (command !== 'db:init' && command !== 'db:check') {
    process.stderr.write('未知数据库命令，可用命令：db:init、db:check。\n');
    return 2;
  }
  let source: DataSource | undefined;
  let exitCode = 0;
  try {
    source = new DataSource(await databaseOptions());
    await source.initialize();
    if (command === 'db:init') await initializeEmptyDatabase(source);
    else await verifyDatabaseSchema(source);
  } catch {
    process.stderr.write(
      '数据库操作失败：请检查连接、空库条件、启用模块和结构基线；未自动删除或迁移任何表。\n',
    );
    exitCode = 1;
  } finally {
    try {
      if (source?.isInitialized) await source.destroy();
    } catch {
      process.stderr.write('数据库连接关闭失败，请检查数据库服务状态。\n');
      exitCode = 1;
    }
  }
  if (exitCode === 0) {
    process.stdout.write(
      command === 'db:init'
        ? '数据库当前基线初始化/核对完成。\n'
        : '数据库当前基线与实际结构核对通过。\n',
    );
  }
  return exitCode;
}
