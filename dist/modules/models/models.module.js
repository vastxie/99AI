"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ModelsModule = void 0;
const common_1 = require("@nestjs/common");
const models_controller_1 = require("./models.controller");
const models_service_1 = require("./models.service");
const typeorm_1 = require("@nestjs/typeorm");
const models_entity_1 = require("./models.entity");
let ModelsModule = class ModelsModule {
};
ModelsModule = __decorate([
    (0, common_1.Global)(),
    (0, common_1.Module)({
        imports: [typeorm_1.TypeOrmModule.forFeature([models_entity_1.ModelsEntity])],
        controllers: [models_controller_1.ModelsController],
        providers: [models_service_1.ModelsService],
        exports: [models_service_1.ModelsService]
    })
], ModelsModule);
exports.ModelsModule = ModelsModule;
