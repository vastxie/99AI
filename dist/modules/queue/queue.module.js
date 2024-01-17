"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.QueueModule = void 0;
const common_1 = require("@nestjs/common");
const queue_controller_1 = require("./queue.controller");
const queue_service_1 = require("./queue.service");
const bull_1 = require("@nestjs/bull");
const queue_process_1 = require("./queue.process");
let QueueModule = class QueueModule {
};
QueueModule = __decorate([
    (0, common_1.Module)({
        imports: [
            bull_1.BullModule.registerQueueAsync({
                name: 'MJDRAW',
                useFactory: () => {
                    const config = {
                        port: +process.env.REDIS_PORT,
                        host: process.env.REDIS_HOST,
                    };
                    process.env.REDIS_PASSWORD && (config.password = process.env.REDIS_PASSWORD);
                    return {
                        redis: config,
                    };
                },
            }),
        ],
        controllers: [queue_controller_1.QueueController],
        providers: [queue_service_1.QueueService, queue_process_1.QueueProcessor],
    })
], QueueModule);
exports.QueueModule = QueueModule;
