"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.DrawModule = void 0;
const common_1 = require("@nestjs/common");
const draw_controller_1 = require("./draw.controller");
const draw_service_1 = require("./draw.service");
let DrawModule = class DrawModule {
};
DrawModule = __decorate([
    (0, common_1.Module)({
        controllers: [draw_controller_1.DrawController],
        providers: [draw_service_1.DrawService],
    })
], DrawModule);
exports.DrawModule = DrawModule;
