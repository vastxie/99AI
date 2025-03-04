"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.RedisCacheModule = void 0;
const common_1 = require("@nestjs/common");
const redis_1 = require("redis");
const redisCache_controller_1 = require("./redisCache.controller");
const redisCache_service_1 = require("./redisCache.service");
let RedisCacheModule = class RedisCacheModule {
};
RedisCacheModule = __decorate([
    (0, common_1.Global)(),
    (0, common_1.Module)({
        imports: [],
        controllers: [redisCache_controller_1.RedisCacheController],
        providers: [
            {
                provide: 'REDIS_CLIENT',
                useFactory: async () => {
                    const host = process.env.REDIS_HOST;
                    const port = parseInt(process.env.REDIS_PORT, 10);
                    const password = process.env.REDIS_PASSWORD;
                    const username = process.env.REDIS_USER;
                    const database = parseInt(process.env.REDIS_DB, 10) || 0;
                    if (!host || !port) {
                        common_1.Logger.error(`Please configure Redis config | 未配置 Redis 配置信息，请确认配置 Redis 服务以获得更好的体验`, 'RedisCacheModule');
                        return;
                    }
                    const client = (0, redis_1.createClient)({
                        socket: {
                            host,
                            port,
                        },
                        username,
                        password,
                        database,
                    });
                    client.on('ready', () => {
                        common_1.Logger.log(`Redis connection successful`, 'RedisCacheModule');
                    });
                    client.on('error', (err) => {
                        common_1.Logger.error(`Redis connection failed: ${err}`, 'RedisCacheModule');
                    });
                    await client.connect();
                    return client;
                },
            },
            redisCache_service_1.RedisCacheService,
        ],
        exports: ['REDIS_CLIENT', redisCache_service_1.RedisCacheService],
    })
], RedisCacheModule);
exports.RedisCacheModule = RedisCacheModule;
