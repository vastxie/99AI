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
exports.SigninService = void 0;
const globalConfig_service_1 = require("./../globalConfig/globalConfig.service");
const userBalance_service_1 = require("./../userBalance/userBalance.service");
const common_1 = require("@nestjs/common");
const signIn_entity_1 = require("./signIn.entity");
const typeorm_1 = require("@nestjs/typeorm");
const typeorm_2 = require("typeorm");
const date_1 = require("../../common/utils/date");
const user_entity_1 = require("../user/user.entity");
const balance_constant_1 = require("../../common/constants/balance.constant");
let SigninService = class SigninService {
    constructor(signinEntity, userEntity, userBalanceService, globalConfigService) {
        this.signinEntity = signinEntity;
        this.userEntity = userEntity;
        this.userBalanceService = userBalanceService;
        this.globalConfigService = globalConfigService;
    }
    async sign(req) {
        const { id: userId } = req.user;
        const formattedDate = (0, date_1.default)(new Date()).format('YYYY-MM-DD');
        const existingSignin = await this.signinEntity.findOne({
            where: { userId, signInDate: formattedDate },
        });
        if (existingSignin) {
            throw new common_1.HttpException('今日已签到、改天再来吧!.', common_1.HttpStatus.BAD_REQUEST);
        }
        const { model3Count, model4Count, drawMjCount } = await this.globalConfigService.getSignatureGiftConfig();
        await this.signinEntity.save({
            userId: userId,
            signInTime: new Date(),
            signInDate: formattedDate,
            isSigned: true,
        });
        await this.userBalanceService.addBalanceToUser(userId, { model3Count, model4Count, drawMjCount });
        await this.userBalanceService.saveRecordRechargeLog({ userId, rechargeType: balance_constant_1.RechargeType.SIGN_IN, model3Count, model4Count, drawMjCount });
        const yesterday = (0, date_1.default)(new Date()).subtract(1, 'day').format('YYYY-MM-DD');
        const previousSignin = await this.signinEntity.findOne({
            where: { userId: userId, signInDate: yesterday },
        });
        if (previousSignin) {
            common_1.Logger.debug(`用户${userId}昨天签到了、今天是连续签到！`, 'SigninService');
            const userInfo = await this.userEntity.findOne({ where: { id: userId } });
            if (!userInfo) {
                throw new common_1.HttpException('用户不存在', common_1.HttpStatus.BAD_REQUEST);
            }
            const { consecutiveDays = 0 } = userInfo;
            await this.userEntity.update({ id: userId }, { consecutiveDays: consecutiveDays + 1 });
        }
        else {
            common_1.Logger.debug(`用户${userId}昨天没签到、今天重置天数！`, 'SigninService');
            await this.userEntity.update({ id: userId }, { consecutiveDays: 1 });
        }
        return 'Sign in successful.';
    }
    async getSigninLog(req) {
        try {
            const { id: userId } = req.user;
            const firstDay = (0, date_1.default)().startOf('month').format('YYYY-MM-DD HH:mm:ss');
            const lastDay = (0, date_1.default)().endOf('month').format('YYYY-MM-DD HH:mm:ss');
            const queryBuilder = this.signinEntity.createQueryBuilder('signin');
            const signInData = await queryBuilder
                .select('signin.signInDate as signInDate, signin.isSigned as isSigned')
                .andWhere('signin.userId = :userId', { userId: req.user.id })
                .andWhere('signin.signInTime >= :firstDay', { firstDay })
                .andWhere('signin.signInTime <= :lastDay', { lastDay })
                .getRawMany();
            const startDate = new Date(firstDay);
            const endDate = new Date(lastDay);
            const dateRange = [];
            const currentDate = new Date(startDate);
            while (currentDate <= endDate) {
                dateRange.push((0, date_1.default)(new Date(currentDate)).format('YYYY-MM-DD'));
                currentDate.setDate(currentDate.getDate() + 1);
            }
            const res = [];
            for (const date of dateRange) {
                const existingData = signInData.find((item) => item.signInDate === date);
                if (!existingData) {
                    res.push({ signInDate: date, isSigned: false });
                }
                else {
                    existingData.isSigned = true;
                    res.push(existingData);
                }
            }
            return res;
        }
        catch (error) {
            console.log('error: ', error);
            throw new common_1.HttpException('获取签到数据失败！', common_1.HttpStatus.BAD_REQUEST);
        }
    }
};
SigninService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, typeorm_1.InjectRepository)(signIn_entity_1.SigninEntity)),
    __param(1, (0, typeorm_1.InjectRepository)(user_entity_1.UserEntity)),
    __metadata("design:paramtypes", [typeorm_2.Repository,
        typeorm_2.Repository,
        userBalance_service_1.UserBalanceService,
        globalConfig_service_1.GlobalConfigService])
], SigninService);
exports.SigninService = SigninService;
