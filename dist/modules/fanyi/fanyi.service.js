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
Object.defineProperty(exports, "__esModule", { value: true });
exports.FanyiService = void 0;
const globalConfig_service_1 = require("./../globalConfig/globalConfig.service");
const common_1 = require("@nestjs/common");
const axios_1 = require("axios");
const crypto = require("crypto");
let FanyiService = class FanyiService {
    constructor(globalConfigService) {
        this.globalConfigService = globalConfigService;
    }
    async convertToEnglish(text) {
        if (!text)
            throw new common_1.HttpException(`请输入要翻译的内容!`, common_1.HttpStatus.BAD_REQUEST);
        const { baiduFanyiAppId, baiduFanyiSecret } = await this.globalConfigService.getConfigs(['baiduFanyiAppId', 'baiduFanyiSecret']);
        if (!baiduFanyiAppId || !baiduFanyiSecret) {
            throw new common_1.HttpException(`当前管理员还未开放翻译服务、请联系管理员开通吧!`, common_1.HttpStatus.BAD_REQUEST);
        }
        const salt = Date.now().toString();
        const sign = crypto
            .createHash('md5')
            .update(baiduFanyiAppId + text + salt + baiduFanyiSecret)
            .digest('hex');
        const url = 'https://fanyi-api.baidu.com/api/trans/vip/translate';
        const params = {
            q: text.toString(),
            from: 'auto',
            to: 'en',
            appid: baiduFanyiAppId,
            salt,
            sign,
        };
        const res = await axios_1.default.post(url, params, {
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        });
        const { from, to, trans_result, error_code, error_msg } = res.data;
        if (error_code) {
            console.log('res: ', res);
            throw new common_1.HttpException(`翻译失败[${error_code}][${error_msg}]!`, common_1.HttpStatus.BAD_REQUEST);
        }
        if (!trans_result || !trans_result.length) {
            console.log('res: ', res);
            throw new common_1.HttpException(`翻译失败[${error_code}][${error_msg}]!`, common_1.HttpStatus.BAD_REQUEST);
        }
        else {
        }
        return trans_result[0].dst;
    }
};
FanyiService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [globalConfig_service_1.GlobalConfigService])
], FanyiService);
exports.FanyiService = FanyiService;
