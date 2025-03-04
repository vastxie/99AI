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
exports.OfficialController = void 0;
const jwtAuth_guard_1 = require("../../common/auth/jwtAuth.guard");
const utils_1 = require("../../common/utils");
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const getQrCode_dto_1 = require("./dto/getQrCode.dto");
const official_service_1 = require("./official.service");
let OfficialController = class OfficialController {
    constructor(officialService) {
        this.officialService = officialService;
    }
    async notify(req, query, body) {
        console.log('get 通知>>>', query, body);
        const result = await this.officialService.verify(query.signature, query.nonce, query.timestamp);
        return result ? query.echostr : '';
    }
    async notifyPost(req, query, xmlData, res) {
        const { xml } = xmlData;
        console.log('xml: ', xml);
        if (xml.msgtype[0] == 'event') {
            if (xml.event[0] == 'VIEW' || xml.event[0] == 'CLICK') {
                return res.status(200).send('');
            }
            if (xml.event[0] == 'SCAN') {
                console.log('扫码');
                const sceneStr = xml.eventkey[0];
                if (sceneStr.includes('/')) {
                    this.officialService.scanBindWx(xml.fromusername[0], sceneStr);
                    const xmlMsg = await this.officialService.genXmlMsgByConfig(xml, 'officialBindAccountText');
                    return res.status(200).send(xmlMsg);
                }
                this.officialService.scan(xml.fromusername[0], sceneStr);
                const xmlMsg = await this.officialService.genXmlMsgByConfig(xml, 'officialScanLoginText');
                return res.status(200).send(xmlMsg);
            }
            if (xml.event[0] == 'subscribe') {
                console.log('订阅', xml.eventkey[0]);
                const sceneStr = xml.eventkey[0].split('qrscene_')[1];
                console.log('sceneStr: ', sceneStr);
                if (!sceneStr) {
                    const xmlMsg = await this.officialService.genXmlMsgByConfig(xml, 'officialSubscribeText');
                    return res.status(200).send(xmlMsg);
                }
                if (sceneStr.includes('/')) {
                    this.officialService.scanBindWx(xml.fromusername[0], sceneStr);
                    const xmlMsg = await this.officialService.genXmlMsgByConfig(xml, 'officialBindAccountText');
                    return res.status(200).send(xmlMsg);
                }
                this.officialService.scan(xml.fromusername[0], sceneStr);
                const xmlMsg = await this.officialService.genXmlMsgByConfig(xml, 'officialSubscribeText');
                return res.status(200).send(xmlMsg);
            }
            if (xml.event[0] == 'unsubscribe') {
                return res.status(200).send('');
            }
        }
        if (xml.msgtype[0] == 'text') {
            const aotoPlayMsg = await this.officialService.aotoPlay(xml.content[0]);
            const xmlMsg = await this.officialService.genXmlMsg(xml, aotoPlayMsg);
            return res.status(200).send(xmlMsg);
        }
        return 'success';
    }
    async getQRSceneStr() {
        return this.officialService.getQRSceneStr();
    }
    async getQRSceneStrByBind(req) {
        return this.officialService.getQRSceneStrByBind(req);
    }
    async getQRCode(query) {
        if (process.env.ISDEV === 'TRUE')
            return '';
        const ticket = await this.officialService.getQRCodeTicket(query.sceneStr);
        const Url = (0, utils_1.formatUrl)(process.env.weChatMpUrl || 'https://mp.weixin.qq.com');
        return `${Url}/cgi-bin/showqrcode?ticket=${encodeURIComponent(ticket)}`;
    }
    async loginBySceneStr(req, body) {
        return this.officialService.loginBySceneStr(req, body);
    }
    async bindWxBySceneStr(req, body) {
        return this.officialService.bindWxBySceneStr(req, body.sceneStr);
    }
    async getRedirectUrl(body) {
        return this.officialService.getRedirectUrl(body.url);
    }
    async getJsapiTicket(body) {
        return this.officialService.getJsapiTicket(body.url);
    }
    async loginByCode(req, body) {
        return this.officialService.loginByCode(req, body.code);
    }
};
__decorate([
    (0, common_1.Get)('notify'),
    (0, swagger_1.ApiOperation)({ summary: '公众号通知接口GET' }),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Query)()),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object, Object]),
    __metadata("design:returntype", Promise)
], OfficialController.prototype, "notify", null);
__decorate([
    (0, common_1.Post)('notify'),
    (0, swagger_1.ApiOperation)({ summary: '公众号通知接口POST' }),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Query)()),
    __param(2, (0, common_1.Body)()),
    __param(3, (0, common_1.Res)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object, Object, Object]),
    __metadata("design:returntype", Promise)
], OfficialController.prototype, "notifyPost", null);
__decorate([
    (0, common_1.Post)('getQRSceneStr'),
    (0, swagger_1.ApiOperation)({ summary: '获取登录二维码sceneStr' }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], OfficialController.prototype, "getQRSceneStr", null);
__decorate([
    (0, common_1.Post)('getQRSceneStrByBind'),
    (0, swagger_1.ApiOperation)({ summary: '获取绑定二维码的sceneStr' }),
    (0, common_1.UseGuards)(jwtAuth_guard_1.JwtAuthGuard),
    __param(0, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], OfficialController.prototype, "getQRSceneStrByBind", null);
__decorate([
    (0, common_1.Get)('getQRCode'),
    (0, swagger_1.ApiOperation)({ summary: '获取二维码' }),
    __param(0, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [getQrCode_dto_1.GetQrCodeDto]),
    __metadata("design:returntype", Promise)
], OfficialController.prototype, "getQRCode", null);
__decorate([
    (0, common_1.Post)('loginBySceneStr'),
    (0, swagger_1.ApiOperation)({ summary: '扫码登录轮询查询' }),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], OfficialController.prototype, "loginBySceneStr", null);
__decorate([
    (0, common_1.Post)('bindWxBySceneStr'),
    (0, swagger_1.ApiOperation)({ summary: '扫码绑定轮询查询' }),
    (0, common_1.UseGuards)(jwtAuth_guard_1.JwtAuthGuard),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, getQrCode_dto_1.GetQrCodeDto]),
    __metadata("design:returntype", Promise)
], OfficialController.prototype, "bindWxBySceneStr", null);
__decorate([
    (0, common_1.Post)('getRedirectUrl'),
    (0, swagger_1.ApiOperation)({ summary: '获取登录跳转地址' }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], OfficialController.prototype, "getRedirectUrl", null);
__decorate([
    (0, common_1.Post)('getJsapiTicket'),
    (0, swagger_1.ApiOperation)({ summary: '获取注册配置' }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], OfficialController.prototype, "getJsapiTicket", null);
__decorate([
    (0, common_1.Post)('loginByCode'),
    (0, swagger_1.ApiOperation)({ summary: '公众号静默登录' }),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], OfficialController.prototype, "loginByCode", null);
OfficialController = __decorate([
    (0, swagger_1.ApiTags)('official'),
    (0, common_1.Controller)('official'),
    __metadata("design:paramtypes", [official_service_1.OfficialService])
], OfficialController);
exports.OfficialController = OfficialController;
