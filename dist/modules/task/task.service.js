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
exports.TaskService = void 0;
const globalConfig_service_1 = require("./../globalConfig/globalConfig.service");
const common_1 = require("@nestjs/common");
const schedule_1 = require("@nestjs/schedule");
const userBalance_entity_1 = require("../userBalance/userBalance.entity");
const typeorm_1 = require("@nestjs/typeorm");
const typeorm_2 = require("typeorm");
const models_service_1 = require("../models/models.service");
let TaskService = class TaskService {
    constructor(userBalanceEntity, globalConfigService, modelsService) {
        this.userBalanceEntity = userBalanceEntity;
        this.globalConfigService = globalConfigService;
        this.modelsService = modelsService;
    }
    handleCron() {
        common_1.Logger.debug('Automatically refresh WeChat access every hour Token', 'TaskService');
        this.globalConfigService.getWechatAccessToken();
    }
    async checkUserMemerExpire() {
        const expireUsers = await this.userBalanceEntity.find({
            where: { expirationTime: (0, typeorm_2.LessThanOrEqual)(new Date()) },
        });
        if (!expireUsers || !expireUsers.length)
            return;
        expireUsers.forEach((user) => {
            this.userBalanceEntity
                .update({ id: user.id }, { expirationTime: null, packageId: 0, memberModel3Count: 0, memberModel4Count: 0, memberDrawMjCount: 0 })
                .then((res) => {
                common_1.Logger.debug(`${user.id}会员已到期、清空所有余额并移除会员身份！`, 'TaskService');
            });
        });
    }
};
__decorate([
    (0, schedule_1.Cron)(schedule_1.CronExpression.EVERY_HOUR),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], TaskService.prototype, "handleCron", null);
__decorate([
    (0, schedule_1.Cron)(schedule_1.CronExpression.EVERY_5_MINUTES),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], TaskService.prototype, "checkUserMemerExpire", null);
TaskService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, typeorm_1.InjectRepository)(userBalance_entity_1.UserBalanceEntity)),
    __metadata("design:paramtypes", [typeorm_2.Repository,
        globalConfig_service_1.GlobalConfigService,
        models_service_1.ModelsService])
], TaskService);
exports.TaskService = TaskService;
