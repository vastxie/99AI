"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ChatGroupModule = void 0;
const common_1 = require("@nestjs/common");
const chatGroup_controller_1 = require("./chatGroup.controller");
const chatGroup_service_1 = require("./chatGroup.service");
const typeorm_1 = require("@nestjs/typeorm");
const chatGroup_entity_1 = require("./chatGroup.entity");
const app_entity_1 = require("../app/app.entity");
let ChatGroupModule = class ChatGroupModule {
};
ChatGroupModule = __decorate([
    (0, common_1.Global)(),
    (0, common_1.Module)({
        imports: [typeorm_1.TypeOrmModule.forFeature([chatGroup_entity_1.ChatGroupEntity, app_entity_1.AppEntity])],
        controllers: [chatGroup_controller_1.ChatGroupController],
        providers: [chatGroup_service_1.ChatGroupService],
        exports: [chatGroup_service_1.ChatGroupService]
    })
], ChatGroupModule);
exports.ChatGroupModule = ChatGroupModule;
