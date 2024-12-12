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
exports.VerificationService = void 0;
const utils_1 = require("../../common/utils");
const globalConfig_service_1 = require("../globalConfig/globalConfig.service");
const common_1 = require("@nestjs/common");
const typeorm_1 = require("@nestjs/typeorm");
const typeorm_2 = require("typeorm");
const redisCache_service_1 = require("../redisCache/redisCache.service");
const status_constant_1 = require("./../../common/constants/status.constant");
const verifycation_entity_1 = require("./verifycation.entity");
const Core = require("@alicloud/pop-core");
const axios_1 = require("axios");
let VerificationService = class VerificationService {
    constructor(verifycationEntity, globalConfigService, redisCacheService) {
        this.verifycationEntity = verifycationEntity;
        this.globalConfigService = globalConfigService;
        this.redisCacheService = redisCacheService;
    }
    async createVerification(user, type, expir = 30 * 60) {
        const historyVerify = await this.verifycationEntity.findOne({
            where: { userId: user.id, type },
            order: { createdAt: 'DESC' },
        });
        if (historyVerify &&
            historyVerify.createdAt.getTime() + 1 * 60 * 1000 > Date.now()) {
            const diffS = Math.ceil((historyVerify.createdAt.getTime() + 1 * 60 * 1000 - Date.now()) / 1000);
            throw new common_1.HttpException(`${diffS}S内不得重新发送`, common_1.HttpStatus.BAD_REQUEST);
        }
        const code = (0, utils_1.createRandomCode)();
        const expiresAt = new Date(Date.now() + expir * 1000);
        const { id, email } = user;
        const verifycation = { userId: id, type, code, expiresAt, email };
        return await this.verifycationEntity.save(verifycation);
    }
    async verifyCode({ code, id }, type) {
        const v = await this.verifycationEntity.findOne({
            where: { id, type },
            order: { createdAt: 'DESC' },
        });
        if (!v) {
            throw new common_1.HttpException('验证码不存在', common_1.HttpStatus.BAD_REQUEST);
        }
        if (v.used === status_constant_1.VerificationUseStatusEnum.USED) {
            throw new common_1.HttpException('当前验证码已被使用！', common_1.HttpStatus.BAD_REQUEST);
        }
        else {
            v.used = status_constant_1.VerificationUseStatusEnum.USED;
            await this.verifycationEntity.update({ id }, v);
        }
        if (Number(v.code) !== Number(code)) {
            throw new common_1.HttpException('验证码错误', common_1.HttpStatus.BAD_REQUEST);
        }
        if (v.expiresAt < new Date()) {
            throw new common_1.HttpException('验证码已过期', common_1.HttpStatus.BAD_REQUEST);
        }
        return v;
    }
    async sendPhoneCode(messageInfo) {
        var _a;
        const { accessKeyId, accessKeySecret, SignName, TemplateCode } = await this.globalConfigService.getPhoneVerifyConfig();
        console.log('Received messageInfo:', messageInfo);
        const { phone, code } = messageInfo;
        if (!phone || !code) {
            throw new common_1.HttpException('确实必要参数错误！', common_1.HttpStatus.BAD_REQUEST);
        }
        const client = new Core({
            accessKeyId,
            accessKeySecret,
            endpoint: 'https://dysmsapi.aliyuncs.com',
            apiVersion: '2017-05-25',
        });
        const params = {
            PhoneNumbers: phone,
            SignName,
            TemplateCode,
            TemplateParam: JSON.stringify({ code }),
        };
        const requestOption = { method: 'POST', formatParams: false };
        try {
            const response = await client.request('SendSms', params, requestOption);
            if (response.Code === 'OK') {
                return true;
            }
            else {
                throw new common_1.HttpException(response.Message || '验证码发送失败！', common_1.HttpStatus.BAD_REQUEST);
            }
        }
        catch (error) {
            throw new common_1.HttpException(((_a = error === null || error === void 0 ? void 0 : error.data) === null || _a === void 0 ? void 0 : _a.Message) || '验证码发送失败！', common_1.HttpStatus.BAD_REQUEST);
        }
    }
    async verifyIdentity(identityInfo) {
        const appCode = await this.globalConfigService.getConfigs(['appCode']);
        const { name, idCard } = identityInfo;
        if (!name || !idCard) {
            throw new common_1.HttpException('缺少必要参数！', common_1.HttpStatus.BAD_REQUEST);
        }
        common_1.Logger.debug(`Received identityInfo: ${name}, ${idCard}`);
        const apiUrl = 'https://eid.shumaidata.com/eid/check';
        const headers = {
            Authorization: `APPCODE ${appCode}`,
            'Content-Type': 'application/x-www-form-urlencoded',
        };
        const params = new URLSearchParams({
            name: name,
            idcard: idCard,
        });
        try {
            const response = await axios_1.default.post(apiUrl, params, { headers });
            const responseString = JSON.stringify(response.data);
            common_1.Logger.debug(`Received response: ${responseString}`);
            switch (response.data.result.res) {
                case '1':
                    return true;
                case '2':
                    common_1.Logger.log('验证不一致', 'VerificationService');
                case '3':
                    common_1.Logger.log('实名认证异常', 'VerificationService');
                default:
                    common_1.Logger.log('未知的认证结果', 'VerificationService');
            }
            return false;
        }
        catch (error) {
            common_1.Logger.error(`Error: ${error.message}`, error.stack, 'Verification');
            return false;
        }
    }
};
VerificationService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, typeorm_1.InjectRepository)(verifycation_entity_1.VerifycationEntity)),
    __metadata("design:paramtypes", [typeorm_2.Repository,
        globalConfig_service_1.GlobalConfigService,
        redisCache_service_1.RedisCacheService])
], VerificationService);
exports.VerificationService = VerificationService;
