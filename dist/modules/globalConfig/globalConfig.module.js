"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.GlobalConfigModule = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("@nestjs/typeorm");
const chatLog_entity_1 = require("../chatLog/chatLog.entity");
const config_entity_1 = require("./config.entity");
const globalConfig_controller_1 = require("./globalConfig.controller");
const globalConfig_service_1 = require("./globalConfig.service");
let GlobalConfigModule = class GlobalConfigModule {
};
GlobalConfigModule = __decorate([
    (0, common_1.Global)(),
    (0, common_1.Module)({
        imports: [typeorm_1.TypeOrmModule.forFeature([config_entity_1.ConfigEntity, chatLog_entity_1.ChatLogEntity])],
        providers: [globalConfig_service_1.GlobalConfigService],
        controllers: [globalConfig_controller_1.GlobalConfigController],
        exports: [globalConfig_service_1.GlobalConfigService],
    })
], GlobalConfigModule);
exports.GlobalConfigModule = GlobalConfigModule;
