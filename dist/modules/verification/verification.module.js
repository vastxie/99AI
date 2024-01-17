"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.VerificationModule = void 0;
const typeorm_1 = require("@nestjs/typeorm");
const common_1 = require("@nestjs/common");
const verification_service_1 = require("./verification.service");
const verifycation_entity_1 = require("./verifycation.entity");
const redisCache_service_1 = require("../redisCache/redisCache.service");
let VerificationModule = class VerificationModule {
};
VerificationModule = __decorate([
    (0, common_1.Module)({
        imports: [typeorm_1.TypeOrmModule.forFeature([verifycation_entity_1.VerifycationEntity])],
        providers: [redisCache_service_1.RedisCacheService, verification_service_1.VerificationService],
    })
], VerificationModule);
exports.VerificationModule = VerificationModule;
