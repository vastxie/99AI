"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var QueueProcessor_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.QueueProcessor = void 0;
const bull_1 = require("@nestjs/bull");
const common_1 = require("@nestjs/common");
const midjourney_service_1 = require("../midjourney/midjourney.service");
let QueueProcessor = QueueProcessor_1 = class QueueProcessor {
    constructor(midjourneyService) {
        this.midjourneyService = midjourneyService;
        this.logger = new common_1.Logger(QueueProcessor_1.name);
    }
    async handleJob(job) {
        const res = await this.midjourneyService.draw(job.data, job.id);
        return res;
    }
    onQueueActive(job) {
    }
    onQueueError(error) {
        console.log('队列发生错误', error);
    }
    onQueueProgress(job, progress) {
        console.log('队列任务的一个回调用于通知当前进度', job.id, progress);
    }
    onQueueCompleted(job, result) {
    }
    onQueueFailed(job, err) {
        common_1.Logger.error(`Queue failed: ${err.message}: 绘画失败 ${job.id}`, 'QueueProcessor');
        this.midjourneyService.drawFailed(job.data);
    }
    onQueuePaused() {
        console.log('队列暂停的时候调用');
    }
    onQueueResumed() {
        console.log('队列恢复的时候调用');
    }
    onQueueCleaned(jobs, type) {
        common_1.Logger.log(`Queue cleaned: ${jobs.length} jobs of type ${type} were cleaned.`, 'QueueProcessor');
    }
    onQueueDrained() {
    }
};
__decorate([
    (0, bull_1.Process)({
        name: 'mjDraw',
        concurrency: process.env.CONCURRENCY ? +process.env.CONCURRENCY : 3,
    }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], QueueProcessor.prototype, "handleJob", null);
__decorate([
    (0, bull_1.OnQueueActive)(),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], QueueProcessor.prototype, "onQueueActive", null);
__decorate([
    (0, bull_1.OnQueueError)(),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Error]),
    __metadata("design:returntype", void 0)
], QueueProcessor.prototype, "onQueueError", null);
__decorate([
    (0, bull_1.OnQueueProgress)(),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Number]),
    __metadata("design:returntype", void 0)
], QueueProcessor.prototype, "onQueueProgress", null);
__decorate([
    (0, bull_1.OnQueueCompleted)(),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", void 0)
], QueueProcessor.prototype, "onQueueCompleted", null);
__decorate([
    (0, bull_1.OnQueueFailed)(),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Error]),
    __metadata("design:returntype", void 0)
], QueueProcessor.prototype, "onQueueFailed", null);
__decorate([
    (0, bull_1.OnQueuePaused)(),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], QueueProcessor.prototype, "onQueuePaused", null);
__decorate([
    (0, bull_1.OnQueueResumed)(),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], QueueProcessor.prototype, "onQueueResumed", null);
__decorate([
    (0, bull_1.OnQueueCleaned)(),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Array, String]),
    __metadata("design:returntype", void 0)
], QueueProcessor.prototype, "onQueueCleaned", null);
__decorate([
    (0, bull_1.OnQueueDrained)(),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], QueueProcessor.prototype, "onQueueDrained", null);
QueueProcessor = QueueProcessor_1 = __decorate([
    (0, bull_1.Processor)('MJDRAW'),
    __metadata("design:paramtypes", [midjourney_service_1.MidjourneyService])
], QueueProcessor);
exports.QueueProcessor = QueueProcessor;
