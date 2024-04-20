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
exports.QueueService = void 0;
const utils_1 = require("../../common/utils");
const bull_1 = require("@nestjs/bull");
const globalConfig_service_1 = require("../globalConfig/globalConfig.service");
const midjourney_service_1 = require("../midjourney/midjourney.service");
const models_service_1 = require("../models/models.service");
const userBalance_service_1 = require("../userBalance/userBalance.service");
let QueueService = class QueueService {
    constructor(mjDrawQueue, midjourneyService, userBalanceService, globalConfigService, modelsService) {
        this.mjDrawQueue = mjDrawQueue;
        this.midjourneyService = midjourneyService;
        this.userBalanceService = userBalanceService;
        this.globalConfigService = globalConfigService;
        this.modelsService = modelsService;
        this.jobIds = [];
    }
    async onApplicationBootstrap() {
        await this.mjDrawQueue.clean(0, 'active');
        await this.midjourneyService.cleanQueue();
    }
    async addMjDrawQueue(body, req) {
        const { orderId, action, drawId } = body;
        await this.midjourneyService.checkLimit(req);
        const detailKeyInfo = await this.modelsService.getCurrentModelKeyInfo('midjourney');
        const keyId = detailKeyInfo === null || detailKeyInfo === void 0 ? void 0 : detailKeyInfo.id;
        const { key, proxyUrl, deduct, deductType, timeout } = detailKeyInfo;
        await this.userBalanceService.validateBalance(req, deductType, action === 'UPSCALE' ? deduct : deduct * 4);
        if (action === 'IMAGINE') {
            const randomDrawId = `${(0, utils_1.createRandomUid)()}`;
            const params = Object.assign(Object.assign({}, body), { userId: req.user.id, randomDrawId });
            const res = await this.midjourneyService.addDrawQueue(params);
            const timeout = (await this.globalConfigService.getConfigs(['mjTimeoutMs'])) || 200000;
            const job = await this.mjDrawQueue.add('mjDraw', { id: res.id, action: action, userId: req.user.id }, { delay: 1000, timeout: +timeout });
            this.jobIds.push(job.id);
            return true;
        }
        else {
            const { action, customId, base64 } = body;
            let { drawId } = body;
            if (action === 'MODAL') {
                const result = await this.midjourneyService.getDrawActionDetail(action, drawId, customId);
                drawId = result.drawId;
            }
            const params = Object.assign(Object.assign({}, body), { userId: req.user.id, drawId });
            const res = await this.midjourneyService.addDrawQueue(params);
            const timeout = (await this.globalConfigService.getConfigs(['mjTimeoutMs'])) || 300000;
            const job = await this.mjDrawQueue.add('mjDraw', { id: res.id, action, userId: req.user.id, base64 }, { delay: 1000, timeout: +timeout });
            this.jobIds.push(job.id);
            return;
        }
    }
    async getQueue() {
        return { jobIds: this.jobIds };
    }
};
QueueService = __decorate([
    __param(0, (0, bull_1.InjectQueue)('MJDRAW')),
    __metadata("design:paramtypes", [Object, midjourney_service_1.MidjourneyService,
        userBalance_service_1.UserBalanceService,
        globalConfig_service_1.GlobalConfigService,
        models_service_1.ModelsService])
], QueueService);
exports.QueueService = QueueService;
