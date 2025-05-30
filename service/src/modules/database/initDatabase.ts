import { Logger } from '@nestjs/common';
import { config as loadEnv } from 'dotenv';
import * as mysql from 'mysql2/promise';
import { DataSource, DataSourceOptions } from 'typeorm';
import { AppEntity } from '../app/app.entity';
import { AppCatsEntity } from '../app/appCats.entity';
import { UserAppsEntity } from '../app/userApps.entity';
import { AutoReplyEntity } from '../autoReply/autoReply.entity';
import { BadWordsEntity } from '../badWords/badWords.entity';
import { ViolationLogEntity } from '../badWords/violationLog.entity';
import { ChatGroupEntity } from '../chatGroup/chatGroup.entity';
import { ChatLogEntity } from '../chatLog/chatLog.entity';
import { CramiEntity } from '../crami/crami.entity';
import { CramiPackageEntity } from '../crami/cramiPackage.entity';
import { ConfigEntity } from '../globalConfig/config.entity';
import { ModelsEntity } from '../models/models.entity';
import { OrderEntity } from '../order/order.entity';
import { PluginEntity } from '../plugin/plugin.entity';
import { Share } from '../share/share.entity';
import { SigninEntity } from '../signin/signIn.entity';
import { UserEntity } from '../user/user.entity';
import { AccountLogEntity } from '../userBalance/accountLog.entity';
import { BalanceEntity } from '../userBalance/balance.entity';
import { FingerprintLogEntity } from '../userBalance/fingerprint.entity';
import { UserBalanceEntity } from '../userBalance/userBalance.entity';
import { VerificationEntity } from '../verification/verification.entity';

loadEnv();

const dataSourceOptions: DataSourceOptions = {
  type: 'mysql',
  port: parseInt(process.env.DB_PORT, 10),
  host: process.env.DB_HOST,
  username: process.env.DB_USER,
  password: process.env.DB_PASS,
  database: process.env.DB_DATABASE,
  entities: [
    Share,
    AutoReplyEntity,
    CramiEntity,
    CramiPackageEntity,
    BadWordsEntity,
    ChatGroupEntity,
    VerificationEntity,
    SigninEntity,
    ViolationLogEntity,
    ModelsEntity,
    UserEntity,
    AccountLogEntity,
    FingerprintLogEntity,
    BalanceEntity,
    UserBalanceEntity,
    PluginEntity,
    ConfigEntity,
    ChatLogEntity,
    UserAppsEntity,
    AppCatsEntity,
    AppEntity,
    OrderEntity,
  ],
  synchronize: false, // 禁用自动同步，改为根据情况动态开启
  charset: 'utf8mb4',
  timezone: '+08:00',
};

/**
 * 通用的列类型迁移函数
 * @param tableName 表名
 * @param columnName 列名
 * @param targetType 目标数据类型
 * @param conn 数据库连接
 * @returns 是否进行了迁移操作
 */
async function migrateColumnType(
  tableName: string,
  columnName: string,
  targetType: string,
  conn: mysql.Connection,
): Promise<boolean> {
  try {
    // 1. 检查表是否存在
    const [tables] = (await conn.execute(
      `SHOW TABLES LIKE '${tableName}'`,
    )) as mysql.RowDataPacket[][];

    if (tables.length === 0) {
      Logger.log(`表 ${tableName} 不存在，跳过 ${columnName} 列的迁移`, 'Database');
      return false;
    }

    // 2. 检查列是否存在和当前数据类型
    const [columns] = (await conn.execute(
      `SELECT COLUMN_NAME, DATA_TYPE FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
      [process.env.DB_DATABASE, tableName, columnName],
    )) as mysql.RowDataPacket[][];

    if (columns.length === 0) {
      Logger.log(`表 ${tableName} 中不存在 ${columnName} 列，跳过迁移`, 'Database');
      return false;
    }

    const currentType = columns[0].DATA_TYPE.toLowerCase();
    if (currentType === targetType.toLowerCase()) {
      Logger.log(`表 ${tableName} 中的 ${columnName} 列已经是 ${targetType} 类型`, 'Database');
      return false;
    }

    // 3. 处理外键约束和索引（如果有）
    const [constraints] = (await conn.execute(
      `SELECT k.CONSTRAINT_NAME
       FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE k
       WHERE k.TABLE_SCHEMA = ? AND k.TABLE_NAME = ? AND k.COLUMN_NAME = ?`,
      [process.env.DB_DATABASE, tableName, columnName],
    )) as mysql.RowDataPacket[][];

    // 处理外键约束
    for (const constraint of constraints) {
      if (constraint.CONSTRAINT_NAME) {
        Logger.log(
          `发现 ${columnName} 列有约束: ${constraint.CONSTRAINT_NAME}，尝试删除`,
          'Database',
        );
        try {
          await conn.execute(
            `ALTER TABLE ${tableName} DROP FOREIGN KEY ${constraint.CONSTRAINT_NAME}`,
          );
          Logger.log(`成功删除 ${columnName} 外键约束`, 'Database');
        } catch (constraintError) {
          Logger.error(`删除外键约束失败: ${constraintError.message}`, 'Database');
        }
      }
    }

    // 检查并处理索引
    const [indexes] = (await conn.execute(
      `SELECT INDEX_NAME FROM INFORMATION_SCHEMA.STATISTICS
       WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
      [process.env.DB_DATABASE, tableName, columnName],
    )) as mysql.RowDataPacket[][];

    for (const idx of indexes) {
      if (idx.INDEX_NAME !== 'PRIMARY') {
        // 不处理主键
        Logger.log(
          `发现 ${columnName} 是索引 ${idx.INDEX_NAME} 的一部分，尝试删除索引`,
          'Database',
        );
        try {
          await conn.execute(`ALTER TABLE ${tableName} DROP INDEX ${idx.INDEX_NAME}`);
          Logger.log(`成功删除索引 ${idx.INDEX_NAME}`, 'Database');
        } catch (indexError) {
          Logger.error(`删除索引失败: ${indexError.message}`, 'Database');
        }
      }
    }

    // 4. 执行列类型迁移
    Logger.log(
      `开始将 ${tableName} 表中的 ${columnName} 列类型从 ${currentType} 升级为 ${targetType}`,
      'Database',
    );
    await conn.execute(`ALTER TABLE ${tableName} MODIFY COLUMN \`${columnName}\` ${targetType}`);
    Logger.log(`${tableName} 表中的 ${columnName} 列类型已成功升级为 ${targetType}`, 'Database');

    return true;
  } catch (error) {
    Logger.error(`迁移 ${tableName}.${columnName} 列类型时出错:`, error, 'Database');
    return false;
  }
}

/**
 * 执行所有数据库迁移
 */
async function runAllMigrations() {
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASS,
    port: parseInt(process.env.DB_PORT, 10),
    database: process.env.DB_DATABASE,
  });

  try {
    // 1. TEXT类型迁移
    try {
      await migrateColumnType('config', 'configVal', 'TEXT', conn);
    } catch (error) {
      Logger.log(`迁移config表configVal列时跳过: ${error.message}`, 'Database');
    }

    try {
      await migrateColumnType('app', 'coverImg', 'TEXT', conn);
    } catch (error) {
      Logger.log(`迁移app表coverImg列时跳过: ${error.message}`, 'Database');
    }

    // 2. catId迁移
    try {
      const appCatIdMigrated = await migrateColumnType('app', 'catId', 'TEXT', conn);
      if (appCatIdMigrated) {
        // 如果app表中的catId被迁移了，考虑更新所有现有数据
        const [apps] = (await conn.execute(`SELECT id, catId FROM app`)) as mysql.RowDataPacket[][];
        for (const app of apps) {
          if (app.catId !== null && app.catId !== undefined) {
            await conn.execute(`UPDATE app SET catId = ? WHERE id = ?`, [
              app.catId.toString(),
              app.id,
            ]);
          }
        }
      }
    } catch (error) {
      Logger.log(`迁移app表catId列时跳过: ${error.message}`, 'Database');
    }

    // 3. MEDIUMTEXT类型迁移
    const chatlogColumns = ['content', 'fileVectorResult'];
    for (const column of chatlogColumns) {
      try {
        await migrateColumnType('chatlog', column, 'MEDIUMTEXT', conn);
      } catch (error) {
        Logger.log(`迁移chatlog表${column}列时跳过: ${error.message}`, 'Database');
      }
    }
  } finally {
    await conn.end();
  }
}

export async function initDatabase() {
  try {
    Logger.log('开始数据库初始化流程', 'Database');

    // 执行所有迁移操作
    Logger.log('执行数据库迁移操作', 'Database');
    await runAllMigrations();

    Logger.log('数据迁移操作完成，现在执行同步确保所有新表和字段存在', 'Database');

    // 先使用禁用同步的连接，确保不会重置迁移后的数据
    const dataSource = new DataSource(dataSourceOptions);
    await dataSource.initialize();
    Logger.log('已连接到数据库，准备同步结构', 'Database');

    // 关闭初始连接
    if (dataSource.isInitialized) {
      await dataSource.destroy();
    }

    // 创建启用同步的连接，确保所有新表和字段被创建
    const syncOptions: DataSourceOptions = {
      ...dataSourceOptions,
      synchronize: true,
    };
    const syncDataSource = new DataSource(syncOptions);
    await syncDataSource.initialize();
    Logger.log('数据库结构同步完成', 'Database');

    // 关闭同步连接
    if (syncDataSource.isInitialized) {
      await syncDataSource.destroy();
    }

    Logger.log('数据库初始化成功完成', 'Database');
  } catch (error) {
    Logger.error(`数据库初始化错误: ${error.message}`, 'Database');
    if (error instanceof SyntaxError) {
      Logger.error(
        `语法错误详情: ${JSON.stringify({
          name: error.name,
          message: error.message,
          stack: error.stack,
        })}`,
        'Database',
      );
    }
  }
}
