"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.BadWordsModule = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("@nestjs/typeorm");
const user_entity_1 = require("../user/user.entity");
const badWords_controller_1 = require("./badWords.controller");
const badWords_entity_1 = require("./badWords.entity");
const badWords_service_1 = require("./badWords.service");
const violationLog_entity_1 = require("./violationLog.entity");
let BadWordsModule = class BadWordsModule {
};
BadWordsModule = __decorate([
    (0, common_1.Global)(),
    (0, common_1.Module)({
        imports: [
            typeorm_1.TypeOrmModule.forFeature([badWords_entity_1.BadWordsEntity, violationLog_entity_1.ViolationLogEntity, user_entity_1.UserEntity]),
        ],
        providers: [badWords_service_1.BadWordsService],
        controllers: [badWords_controller_1.BadWordsController],
        exports: [badWords_service_1.BadWordsService],
    })
], BadWordsModule);
exports.BadWordsModule = BadWordsModule;
