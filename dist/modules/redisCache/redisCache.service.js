"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.RedisCacheService = void 0;
const common_1 = require("@nestjs/common");
let RedisCacheService = class RedisCacheService {
    constructor(redisClient) {
        this.redisClient = redisClient;
    }
    async get(body) {
        const { key } = body;
        const res = await this.redisClient.get(key);
        return await this.redisClient.get(key);
    }
    async set(body, time) {
        try {
            const { key, val } = body;
            await this.redisClient.set(key, val);
            time && (await this.redisClient.expire(key, time));
            return;
        }
        catch (error) {
            throw new common_1.HttpException(error, common_1.HttpStatus.BAD_REQUEST);
        }
    }
    async getJwtSecret() {
        const secret = await this.redisClient.get('JWT_SECRET');
        if (!secret) {
            throw new Error('JWT secret not found in Redis');
        }
        return secret;
    }
    async ttl(key) {
        return await this.redisClient.ttl(key);
    }
    async del(body) {
        const { key } = body;
        await this.redisClient.del(key);
        return;
    }
    async saveToken(userId, token) {
        const tokens = await this.redisClient.zRange(`tokens:${userId}`, 0, -1);
        await this.invalidateTokens(userId, tokens);
        this.redisClient.set(`token:${userId}`, token);
    }
    async invalidateTokens(userId, tokens) {
        tokens.forEach((token) => {
            this.redisClient.del(`token:${userId}:${token}`);
        });
    }
    async checkTokenAuth(token, req) {
        const { id: userId, role } = req.user;
        if (role === 'visitor')
            return true;
        const storedToken = await this.redisClient.get(`token:${userId}`);
        if (storedToken === null) {
            await this.redisClient.set(`token:${userId}`, token);
            return true;
        }
        if (storedToken !== token) {
            if (['super', 'admin'].includes(role))
                return true;
            throw new common_1.HttpException('您已在其他设备覆盖登录、请您重新登录！', common_1.HttpStatus.UNAUTHORIZED);
        }
    }
};
RedisCacheService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, common_1.Inject)('REDIS_CLIENT')),
    __metadata("design:paramtypes", [Object])
], RedisCacheService);
exports.RedisCacheService = RedisCacheService;
