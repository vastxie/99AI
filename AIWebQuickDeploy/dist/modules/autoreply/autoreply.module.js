"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AutoreplyModule = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("@nestjs/typeorm");
const autoreply_controller_1 = require("./autoreply.controller");
const autoreply_entity_1 = require("./autoreply.entity");
const autoreply_service_1 = require("./autoreply.service");
let AutoreplyModule = class AutoreplyModule {
};
AutoreplyModule = __decorate([
    (0, common_1.Global)(),
    (0, common_1.Module)({
        imports: [typeorm_1.TypeOrmModule.forFeature([autoreply_entity_1.AutoReplyEntity])],
        controllers: [autoreply_controller_1.AutoreplyController],
        providers: [autoreply_service_1.AutoreplyService],
        exports: [autoreply_service_1.AutoreplyService],
    })
], AutoreplyModule);
exports.AutoreplyModule = AutoreplyModule;
