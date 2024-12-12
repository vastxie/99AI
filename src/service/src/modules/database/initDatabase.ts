import { Logger } from '@nestjs/common';
import { config as loadEnv } from 'dotenv';
import * as mysql from 'mysql2/promise';
import { DataSource, DataSourceOptions } from 'typeorm';
loadEnv();

const dataSourceOptions: DataSourceOptions = {
  type: 'mysql',
  port: parseInt(process.env.DB_PORT, 10),
  host: process.env.DB_HOST,
  username: process.env.DB_USER,
  password: process.env.DB_PASS,
  database: process.env.DB_DATABASE,
  entities: [__dirname + '/../**/*.entity{.ts,.js}'],
  logging: false,
  synchronize: true, // 启用自动同步
  charset: 'utf8mb4',
  timezone: '+08:00',
};

async function validateDatabase() {
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASS,
    port: parseInt(process.env.DB_PORT, 10),
  });

  try {
    const [rows] = (await conn.execute(
      `SHOW DATABASES LIKE '${process.env.DB_DATABASE}'`
    )) as mysql.RowDataPacket[][];
    if (Array.isArray(rows) && rows.length === 0) {
      await conn.execute(`CREATE DATABASE ${process.env.DB_DATABASE}`);
      Logger.log(`数据库创建成功[${process.env.DB_DATABASE}]`, 'Database');
    } else {
      Logger.log(`数据库已存在[${process.env.DB_DATABASE}]`, 'Database');
    }
  } catch (error) {
    Logger.error('Error during database validation:', error, 'Database');
  } finally {
    await conn.end();
  }
}

async function updateColumnType() {
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASS,
    port: parseInt(process.env.DB_PORT, 10),
    database: process.env.DB_DATABASE,
  });

  async function checkAndUpdateColumnType(
    tableName: string,
    columnName: string
  ) {
    try {
      const [rows] = (await conn.execute(
        `SELECT COLUMN_NAME, DATA_TYPE FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = ? AND COLUMN_NAME = ?`,
        [tableName, columnName]
      )) as mysql.RowDataPacket[][];

      if (rows.length > 0 && rows[0].DATA_TYPE !== 'text') {
        await conn.execute(`ALTER TABLE ?? MODIFY COLUMN ?? TEXT`, [
          tableName,
          columnName,
        ]);
        Logger.log(
          `Column ${columnName} type updated to TEXT in table ${tableName}`,
          'Database'
        );
      } else {
        Logger.log(
          `Column ${columnName} is already of type TEXT in table ${tableName}`,
          'Database'
        );
      }
    } catch (error) {
      Logger.error(`Error updating column type in table ${tableName}:`, error);
    }
  }

  try {
    await checkAndUpdateColumnType('config', 'configVal');
    await checkAndUpdateColumnType('app', 'coverImg');
  } finally {
    await conn.end();
  }
}

export async function initDatabase() {
  await validateDatabase();
  await updateColumnType();

  const dataSource = new DataSource(dataSourceOptions);

  try {
    await dataSource.initialize();
    Logger.log('Database connected and synchronized successfully', 'Database');
    // 进行其他必要的操作，例如插入初始数据等
  } catch (error) {
    Logger.error('Error during TypeORM initialization:', error);
  } finally {
    await dataSource.destroy();
  }
}
