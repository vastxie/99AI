"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ChatLogModule = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("@nestjs/typeorm");
const chatGroup_entity_1 = require("../chatGroup/chatGroup.entity");
const user_entity_1 = require("../user/user.entity");
const chatLog_controller_1 = require("./chatLog.controller");
const chatLog_entity_1 = require("./chatLog.entity");
const chatLog_service_1 = require("./chatLog.service");
let ChatLogModule = class ChatLogModule {
};
ChatLogModule = __decorate([
    (0, common_1.Global)(),
    (0, common_1.Module)({
        imports: [
            typeorm_1.TypeOrmModule.forFeature([chatLog_entity_1.ChatLogEntity, user_entity_1.UserEntity, chatGroup_entity_1.ChatGroupEntity]),
        ],
        controllers: [chatLog_controller_1.ChatLogController],
        providers: [chatLog_service_1.ChatLogService],
        exports: [chatLog_service_1.ChatLogService],
    })
], ChatLogModule);
exports.ChatLogModule = ChatLogModule;
