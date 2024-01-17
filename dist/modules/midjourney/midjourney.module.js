"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.MidjourneyModule = void 0;
const common_1 = require("@nestjs/common");
const midjourney_controller_1 = require("./midjourney.controller");
const midjourney_service_1 = require("./midjourney.service");
const typeorm_1 = require("@nestjs/typeorm");
const midjourney_entity_1 = require("./midjourney.entity");
const user_entity_1 = require("../user/user.entity");
const redisCache_service_1 = require("../redisCache/redisCache.service");
const prompt_entity_1 = require("./prompt.entity");
let MidjourneyModule = class MidjourneyModule {
};
MidjourneyModule = __decorate([
    (0, common_1.Global)(),
    (0, common_1.Module)({
        imports: [typeorm_1.TypeOrmModule.forFeature([midjourney_entity_1.MidjourneyEntity, user_entity_1.UserEntity, prompt_entity_1.mjPromptEntity])],
        controllers: [midjourney_controller_1.MidjourneyController],
        providers: [midjourney_service_1.MidjourneyService, redisCache_service_1.RedisCacheService],
        exports: [midjourney_service_1.MidjourneyService],
    })
], MidjourneyModule);
exports.MidjourneyModule = MidjourneyModule;
