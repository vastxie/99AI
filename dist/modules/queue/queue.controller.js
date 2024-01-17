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
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.QueueController = void 0;
const queue_service_1 = require("./queue.service");
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const mjDraw_dto_1 = require("./dto/mjDraw.dto");
const jwtAuth_guard_1 = require("../../common/auth/jwtAuth.guard");
let QueueController = class QueueController {
    constructor(queueService) {
        this.queueService = queueService;
    }
    async mjDraw(body, req) {
        return await this.queueService.addMjDrawQueue(body, req);
    }
    async getQueue() {
        return await this.queueService.getQueue();
    }
};
__decorate([
    (0, common_1.Post)('addMjDrawQueue'),
    (0, swagger_1.ApiOperation)({ summary: '提交绘制图片任务' }),
    (0, common_1.UseGuards)(jwtAuth_guard_1.JwtAuthGuard),
    (0, swagger_1.ApiBearerAuth)(),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [mjDraw_dto_1.MjDrawDto, Object]),
    __metadata("design:returntype", Promise)
], QueueController.prototype, "mjDraw", null);
__decorate([
    (0, common_1.Get)('getQueue'),
    (0, swagger_1.ApiOperation)({ summary: '查询任务队列' }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], QueueController.prototype, "getQueue", null);
QueueController = __decorate([
    (0, swagger_1.ApiTags)('Queue'),
    (0, common_1.Controller)('queue'),
    __metadata("design:paramtypes", [queue_service_1.QueueService])
], QueueController);
exports.QueueController = QueueController;
