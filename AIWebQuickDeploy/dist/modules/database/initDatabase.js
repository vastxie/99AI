"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.initDatabase = void 0;
const common_1 = require("@nestjs/common");
const dotenv_1 = require("dotenv");
const mysql = require("mysql2/promise");
const typeorm_1 = require("typeorm");
(0, dotenv_1.config)();
const dataSourceOptions = {
    type: 'mysql',
    port: parseInt(process.env.DB_PORT, 10),
    host: process.env.DB_HOST,
    username: process.env.DB_USER,
    password: process.env.DB_PASS,
    database: process.env.DB_DATABASE,
    entities: [__dirname + '/../**/*.entity{.ts,.js}'],
    logging: false,
    synchronize: true,
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
        const [rows] = (await conn.execute(`SHOW DATABASES LIKE '${process.env.DB_DATABASE}'`));
        if (Array.isArray(rows) && rows.length === 0) {
            await conn.execute(`CREATE DATABASE ${process.env.DB_DATABASE}`);
            common_1.Logger.log(`数据库创建成功[${process.env.DB_DATABASE}]`, 'Database');
        }
        else {
            common_1.Logger.log(`数据库已存在[${process.env.DB_DATABASE}]`, 'Database');
        }
    }
    catch (error) {
        common_1.Logger.error('Error during database validation:', error, 'Database');
    }
    finally {
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
    async function checkAndUpdateColumnType(tableName, columnName) {
        try {
            const [rows] = (await conn.execute(`SELECT COLUMN_NAME, DATA_TYPE FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = ? AND COLUMN_NAME = ?`, [tableName, columnName]));
            if (rows.length > 0 && rows[0].DATA_TYPE !== 'text') {
                await conn.execute(`ALTER TABLE ?? MODIFY COLUMN ?? TEXT`, [
                    tableName,
                    columnName,
                ]);
                common_1.Logger.log(`Column ${columnName} type updated to TEXT in table ${tableName}`, 'Database');
            }
            else {
                common_1.Logger.log(`Column ${columnName} is already of type TEXT in table ${tableName}`, 'Database');
            }
        }
        catch (error) {
            common_1.Logger.error(`Error updating column type in table ${tableName}:`, error);
        }
    }
    try {
        await checkAndUpdateColumnType('config', 'configVal');
        await checkAndUpdateColumnType('app', 'coverImg');
    }
    finally {
        await conn.end();
    }
}
async function initDatabase() {
    await validateDatabase();
    await updateColumnType();
    const dataSource = new typeorm_1.DataSource(dataSourceOptions);
    try {
        await dataSource.initialize();
        common_1.Logger.log('Database connected and synchronized successfully', 'Database');
    }
    catch (error) {
        common_1.Logger.error('Error during TypeORM initialization:', error);
    }
    finally {
        await dataSource.destroy();
    }
}
exports.initDatabase = initDatabase;
