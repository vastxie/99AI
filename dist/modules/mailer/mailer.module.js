"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var MailerModule_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.MailerModule = void 0;
const common_1 = require("@nestjs/common");
const nestjs_config_1 = require("nestjs-config");
const mailer_1 = require("@nestjs-modules/mailer");
const mailer_service_1 = require("./mailer.service");
let MailerModule = MailerModule_1 = class MailerModule {
};
MailerModule = MailerModule_1 = __decorate([
    (0, common_1.Module)({
        imports: [
            nestjs_config_1.ConfigModule,
            mailer_1.MailerModule.forRootAsync({
                useFactory: (config) => config.get('mailer'),
                inject: [nestjs_config_1.ConfigService],
            }),
        ],
        exports: [MailerModule_1],
        providers: [mailer_service_1.MailerService],
    })
], MailerModule);
exports.MailerModule = MailerModule;
