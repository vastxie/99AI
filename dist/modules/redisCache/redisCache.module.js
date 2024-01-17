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
const redisCache_service_1 = require("./redisCache.service");
const redisCache_controller_1 = require("./redisCache.controller");
const nestjs_config_1 = require("nestjs-config");
const redis_1 = require("redis");
let RedisCacheModule = class RedisCacheModule {
};
RedisCacheModule = __decorate([
    (0, common_1.Global)(),
    (0, common_1.Module)({
        imports: [nestjs_config_1.ConfigModule],
        controllers: [redisCache_controller_1.RedisCacheController],
        providers: [
            {
                provide: 'REDIS_CLIENT',
                useFactory: async (redisConfig) => {
                    const port = +process.env.REDIS_PORT;
                    const host = process.env.REDIS_HOST;
                    const password = process.env.REDIS_PASSWORD;
                    const username = process.env.REDIS_USER;
                    if (!host || !port) {
                        common_1.Logger.error(`Please config Redis config | 未配置 Redis 配置信息 请确认配置redis服务以获得更好的体验`, 'RedistCacheModule');
                        return;
                    }
                    const client = (0, redis_1.createClient)({
                        socket: { host, port },
                        username,
                        password,
                    });
                    const res = await client.connect();
                    client.on('ready', () => {
                        common_1.Logger.debug(`Your Redis connection successful`, 'RedistCacheModule');
                    });
                    client.on('error', () => {
                        common_1.Logger.error(`Your Redis connection failed | 您的 Redist 连接失败`, 'RedistCacheModule');
                    });
                    return client;
                },
                inject: [nestjs_config_1.ConfigService],
            },
            redisCache_service_1.RedisCacheService,
        ],
        exports: ['REDIS_CLIENT'],
    })
], RedisCacheModule);
exports.RedisCacheModule = RedisCacheModule;
