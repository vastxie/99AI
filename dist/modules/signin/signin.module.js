"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.SigninModule = void 0;
const common_1 = require("@nestjs/common");
const signin_controller_1 = require("./signin.controller");
const signin_service_1 = require("./signin.service");
const typeorm_1 = require("@nestjs/typeorm");
const signIn_entity_1 = require("./signIn.entity");
const user_entity_1 = require("../user/user.entity");
let SigninModule = class SigninModule {
};
SigninModule = __decorate([
    (0, common_1.Global)(),
    (0, common_1.Module)({
        imports: [typeorm_1.TypeOrmModule.forFeature([signIn_entity_1.SigninEntity, user_entity_1.UserEntity])],
        controllers: [signin_controller_1.SigninController],
        providers: [signin_service_1.SigninService],
        exports: [signin_service_1.SigninService],
    })
], SigninModule);
exports.SigninModule = SigninModule;
