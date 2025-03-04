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
exports.RedisCacheController = void 0;
const redis_dto_1 = require("./dto/redis.dto");
const redisCache_service_1 = require("./redisCache.service");
const common_1 = require("@nestjs/common");
let RedisCacheController = class RedisCacheController {
    constructor(redisCacheService) {
        this.redisCacheService = redisCacheService;
    }
    set(body) {
        return this.redisCacheService.set(body);
    }
    get(body) {
        return this.redisCacheService.get(body);
    }
};
__decorate([
    (0, common_1.Post)('set'),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [redis_dto_1.RedisDto]),
    __metadata("design:returntype", void 0)
], RedisCacheController.prototype, "set", null);
__decorate([
    (0, common_1.Get)('get'),
    __param(0, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [redis_dto_1.RedisDto]),
    __metadata("design:returntype", void 0)
], RedisCacheController.prototype, "get", null);
RedisCacheController = __decorate([
    (0, common_1.Controller)('redisCache'),
    __metadata("design:paramtypes", [redisCache_service_1.RedisCacheService])
], RedisCacheController);
exports.RedisCacheController = RedisCacheController;
