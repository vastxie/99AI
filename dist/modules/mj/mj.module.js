"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.MjModule = void 0;
const chatLog_entity_1 = require("./../chatLog/chatLog.entity");
const common_1 = require("@nestjs/common");
const mj_service_1 = require("./mj.service");
const mj_controller_1 = require("./mj.controller");
const typeorm_1 = require("@nestjs/typeorm");
const balance_entity_1 = require("../userBalance/balance.entity");
let MjModule = class MjModule {
};
MjModule = __decorate([
    (0, common_1.Global)(),
    (0, common_1.Module)({
        imports: [typeorm_1.TypeOrmModule.forFeature([chatLog_entity_1.ChatLogEntity, balance_entity_1.BalanceEntity])],
        providers: [mj_service_1.MjService],
        controllers: [mj_controller_1.MjController],
        exports: [mj_service_1.MjService],
    })
], MjModule);
exports.MjModule = MjModule;
