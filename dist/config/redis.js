"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const config = {
    port: parseInt(process.env.REDIS_PORT),
    host: process.env.REDIS_HOST,
    password: process.env.REDIS_PASSWORD,
    username: process.env.REDIS_USER,
};
exports.default = config;
