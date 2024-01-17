"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.initDatabase = void 0;
const mysql = require("mysql2/promise");
const common_1 = require("@nestjs/common");
function initDatabase() {
    mysql
        .createConnection({
        host: process.env.DB_HOST,
        user: process.env.DB_USER,
        password: process.env.DB_PASS,
        port: parseInt(process.env.DB_PORT),
    })
        .then(async (conn) => {
        const [rows] = await conn.execute(`SHOW DATABASES LIKE '${process.env.DB_DATABASE}'`);
        if (Array.isArray(rows) && rows.length === 0) {
            await conn.execute(`CREATE DATABASE ${process.env.DB_DATABASE}`);
            common_1.Logger.log(`数据库创建成功[${process.env.DB_DATABASE}]`);
        }
        await conn.end();
    });
}
exports.initDatabase = initDatabase;
