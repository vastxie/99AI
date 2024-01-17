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
exports.PayService = void 0;
const typeorm_1 = require("@nestjs/typeorm");
const typeorm_2 = require("typeorm");
const common_1 = require("@nestjs/common");
const crypto = require("crypto");
const axios_1 = require("axios");
const order_entity_1 = require("../order/order.entity");
const cramiPackage_entity_1 = require("../crami/cramiPackage.entity");
const userBalance_service_1 = require("../userBalance/userBalance.service");
const globalConfig_service_1 = require("../globalConfig/globalConfig.service");
const utils_1 = require("../../common/utils");
const user_service_1 = require("../user/user.service");
let PayService = class PayService {
    constructor(cramiPackageEntity, orderEntity, userBalanceService, globalConfigService, userService) {
        this.cramiPackageEntity = cramiPackageEntity;
        this.orderEntity = orderEntity;
        this.userBalanceService = userBalanceService;
        this.globalConfigService = globalConfigService;
        this.userService = userService;
    }
    async onModuleInit() {
        const wpay = await (0, utils_1.importDynamic)('wechatpay-node-v3');
        this.WxPay = (wpay === null || wpay === void 0 ? void 0 : wpay.default) ? wpay.default : wpay;
    }
    async notify(params) {
        if (params['param'] == 'epay') {
            return this.notifyEpay(params);
        }
        if (params['attach'] == 'hupi') {
            return this.notifyHupi(params);
        }
        if (typeof params['resource'] == 'object') {
            return this.notifyWeChat(params);
        }
        return this.notifyMpay(params);
    }
    async pay(userId, orderId, payType = 'wxpay') {
        const order = await this.orderEntity.findOne({ where: { userId, orderId } });
        if (!order)
            throw new common_1.HttpException('订单不存在!', common_1.HttpStatus.BAD_REQUEST);
        const goods = await this.cramiPackageEntity.findOne({ where: { id: order.goodsId } });
        if (!goods)
            throw new common_1.HttpException('套餐不存在!', common_1.HttpStatus.BAD_REQUEST);
        console.log('本次支付类型: ', order.payPlatform);
        try {
            if (order.payPlatform == 'wechat') {
                return this.payWeChat(userId, orderId, payType);
            }
            if (order.payPlatform == 'epay') {
                return this.payEpay(userId, orderId, payType);
            }
            if (order.payPlatform == 'mpay') {
                return this.payMpay(userId, orderId, payType);
            }
            if (order.payPlatform == 'hupi') {
                return this.payHupi(userId, orderId, payType);
            }
        }
        catch (error) {
            console.log('支付请求失败: ', error);
            throw new common_1.HttpException('支付请求失败!', common_1.HttpStatus.BAD_REQUEST);
        }
    }
    async query(orderId) {
        const order = await this.orderEntity.findOne({ where: { orderId } });
        if (!order)
            throw new common_1.HttpException('订单不存在!', common_1.HttpStatus.BAD_REQUEST);
        return order;
    }
    async notifyHupi(params) {
        const payHupiSecret = await this.globalConfigService.getConfigs(['payHupiSecret']);
        const hash = params['hash'];
        delete params['hash'];
        if (this.sign(params, payHupiSecret) != hash)
            return 'failed';
        const order = await this.orderEntity.findOne({ where: { orderId: params['trade_order_id'], status: 0 } });
        if (!order)
            return 'failed';
        await this.userBalanceService.addBalanceToOrder(order);
        const result = await this.orderEntity.update({ orderId: params['trade_order_id'] }, { status: 1, paydAt: new Date() });
        if (result.affected != 1)
            return 'failed';
        return 'success';
    }
    async payHupi(userId, orderId, payType = 'wxpay') {
        const order = await this.orderEntity.findOne({ where: { userId, orderId } });
        if (!order)
            throw new common_1.HttpException('订单不存在!', common_1.HttpStatus.BAD_REQUEST);
        const goods = await this.cramiPackageEntity.findOne({ where: { id: order.goodsId } });
        if (!goods)
            throw new common_1.HttpException('套餐不存在!', common_1.HttpStatus.BAD_REQUEST);
        const { payHupiAppId, payHupiSecret, payHupiNotifyUrl, payHupiReturnUrl, payHupiGatewayUrl } = await this.globalConfigService.getConfigs([
            'payHupiAppId',
            'payHupiSecret',
            'payHupiNotifyUrl',
            'payHupiReturnUrl',
            'payHupiGatewayUrl'
        ]);
        const params = {};
        params['version'] = '1.1';
        params['appid'] = payHupiAppId;
        params['time'] = (Date.now() / 1000).toFixed(0);
        params['nonce_str'] = (0, utils_1.createRandomNonceStr)(32);
        params['trade_order_id'] = orderId;
        params['title'] = goods.name;
        params['total_fee'] = order.total;
        params['notify_url'] = payHupiNotifyUrl;
        params['return_url'] = payHupiReturnUrl;
        params['attach'] = 'hupi';
        params['hash'] = this.sign(params, payHupiSecret);
        const { data: { errcode, errmsg, url_qrcode, url }, } = await axios_1.default.post(payHupiGatewayUrl || 'https://api.xunhupay.com/payment/do.html', params);
        if (errcode != 0)
            throw new common_1.HttpException(errmsg, common_1.HttpStatus.BAD_REQUEST);
        return { url_qrcode, url };
    }
    async queryHupi(orderId) {
        const { payHupiAppId, payHupiSecret } = await this.globalConfigService.getConfigs(['payHupiAppId', 'payHupiSecret']);
        const params = {};
        params['version'] = '1.1';
        params['appid'] = payHupiAppId;
        params['time'] = (Date.now() / 1000).toFixed(0);
        params['nonce_str'] = (0, utils_1.createRandomNonceStr)(32);
        params['out_trade_order'] = orderId;
        params['hash'] = this.sign(params, payHupiSecret);
        const { data: { errcode, errmsg, data: result }, } = await axios_1.default.post('https://api.xunhupay.com/payment/query.html', params);
        if (errcode != 0)
            throw new common_1.HttpException(errmsg, common_1.HttpStatus.BAD_REQUEST);
        return result;
    }
    async notifyEpay(params) {
        const sign = params['sign'];
        delete params['sign'];
        delete params['sign_type'];
        const payEpaySecret = await this.globalConfigService.getConfigs(['payEpaySecret']);
        if (this.sign(params, payEpaySecret) != sign)
            return 'failed';
        console.log('校验签名通过');
        const order = await this.orderEntity.findOne({ where: { orderId: params['out_trade_no'], status: 0 } });
        if (!order)
            return 'failed';
        const status = params['trade_status'] == 'TRADE_SUCCESS' ? 1 : 2;
        const result = await this.orderEntity.update({ orderId: params['out_trade_no'] }, { status, paydAt: new Date() });
        if (status === 1) {
            await this.userBalanceService.addBalanceToOrder(order);
        }
        if (result.affected != 1)
            return 'failed';
        return 'success';
    }
    async payEpay(userId, orderId, payType = 'alipay') {
        const order = await this.orderEntity.findOne({ where: { userId, orderId } });
        if (!order)
            throw new common_1.HttpException('订单不存在!', common_1.HttpStatus.BAD_REQUEST);
        const goods = await this.cramiPackageEntity.findOne({ where: { id: order.goodsId } });
        if (!goods)
            throw new common_1.HttpException('套餐不存在!', common_1.HttpStatus.BAD_REQUEST);
        const { payEpayPid, payEpaySecret, payEpayNotifyUrl, payEpayReturnUrl, payEpayApiPayUrl } = await this.globalConfigService.getConfigs([
            'payEpayPid',
            'payEpaySecret',
            'payEpayNotifyUrl',
            'payEpayReturnUrl',
            'payEpayApiPayUrl',
        ]);
        let convertedNumber;
        if (payEpayPid.length <= 16) {
            convertedNumber = Number(payEpayPid);
        }
        else {
            convertedNumber = BigInt(payEpayPid);
        }
        const params = {};
        params['pid'] = convertedNumber;
        params['type'] = payType;
        params['out_trade_no'] = orderId;
        params['name'] = goods.name;
        params['money'] = order.total;
        params['clientip'] = '192.168.1.100';
        params['device'] = 'pc';
        params['notify_url'] = payEpayNotifyUrl;
        params['return_url'] = payEpayReturnUrl;
        params['param'] = 'epay';
        params['sign'] = this.sign(params, payEpaySecret);
        params['sign_type'] = 'MD5';
        const queryParams = new URLSearchParams(params).toString();
        const apiUrl = `${payEpayApiPayUrl}?${queryParams}`;
        if (payEpayApiPayUrl.includes('submit.php')) {
            return { url_qrcode: null, redirectUrl: apiUrl, channel: payType, isRedirect: true };
        }
        else {
            const res = await axios_1.default.get(payEpayApiPayUrl, { params });
            console.log('epay ---> res: ', res.data);
            const { data: { code, msg, qrcode: url_qrcode }, } = res;
            if (code != 1)
                throw new common_1.HttpException(msg, common_1.HttpStatus.BAD_REQUEST);
            return { url_qrcode, redirectUrl: null, channel: payType, isRedirect: false };
        }
    }
    async queryEpay(orderId) {
        const { payEpayPid, payEpaySecret, payEpayApiQueryUrl } = await this.globalConfigService.getConfigs([
            'payEpayPid',
            'payEpaySecret',
            'payEpayApiQueryUrl',
        ]);
        const params = {};
        params['act'] = 'order';
        params['out_trade_no'] = orderId;
        params['pid'] = payEpayPid;
        params['key'] = payEpaySecret;
        const { data: { code, msg, data: result }, } = await axios_1.default.get(payEpayApiQueryUrl, { params });
        if (code != 1)
            throw new common_1.HttpException(msg, common_1.HttpStatus.BAD_REQUEST);
        return result;
    }
    async notifyMpay(params) {
        const sign = params['sign'];
        delete params['sign'];
        delete params['sign_type'];
        const payMpaySecret = await this.globalConfigService.getConfigs(['payMpaySecret']);
        console.log('校验签名');
        if (this.sign(params, payMpaySecret) != sign)
            return 'failed';
        console.log('校验签名通过');
        const order = await this.orderEntity.findOne({ where: { orderId: params['out_trade_no'], status: 0 } });
        if (!order)
            return 'failed';
        const status = params['trade_status'] == 'TRADE_SUCCESS' ? 1 : 2;
        console.log('status: ', status);
        const result = await this.orderEntity.update({ orderId: params['out_trade_no'] }, { status, paydAt: new Date() });
        if (status === 1) {
            await this.userBalanceService.addBalanceToOrder(order);
        }
        if (result.affected != 1)
            return 'failed';
        return 'success';
    }
    async payMpay(userId, orderId, payType = 'wxpay') {
        const order = await this.orderEntity.findOne({ where: { userId, orderId } });
        if (!order)
            throw new common_1.HttpException('订单不存在!', common_1.HttpStatus.BAD_REQUEST);
        const goods = await this.cramiPackageEntity.findOne({ where: { id: order.goodsId } });
        if (!goods)
            throw new common_1.HttpException('套餐不存在!', common_1.HttpStatus.BAD_REQUEST);
        const { payMpayPid, payMpaySecret, payMpayNotifyUrl, payMpayReturnUrl, payMpayApiPayUrl } = await this.globalConfigService.getConfigs([
            'payMpayPid',
            'payMpaySecret',
            'payMpayNotifyUrl',
            'payMpayReturnUrl',
            'payMpayApiPayUrl',
        ]);
        const params = {};
        params['pid'] = Number(payMpayPid);
        params['type'] = payType;
        params['out_trade_no'] = orderId;
        params['name'] = goods.name;
        params['money'] = order.total;
        params['notify_url'] = payMpayNotifyUrl;
        params['return_url'] = payMpayReturnUrl;
        params['sign'] = this.sign(params, payMpaySecret);
        params['sign_type'] = 'MD5';
        const queryParams = new URLSearchParams(params).toString();
        const apiUrl = `${payMpayApiPayUrl}?${queryParams}`;
        return { url_qrcode: null, redirectUrl: apiUrl, channel: payType, isRedirect: true };
        const res = await axios_1.default.get(payMpayApiPayUrl, { params });
    }
    async queryMpay(orderId) {
        const { payMpayApiQueryUrl } = await this.globalConfigService.getConfigs(['payMpayPid', 'payMpaySecret', 'payMpayApiQueryUrl']);
        const params = {};
        params['type'] = 2;
        params['order_no'] = orderId;
        const { data: { code, msg, data: result }, } = await axios_1.default.get(payMpayApiQueryUrl, { params });
        if (code != 1)
            throw new common_1.HttpException(msg, common_1.HttpStatus.BAD_REQUEST);
        return result;
    }
    async notifyWeChat(params) {
        console.log('微信支付通知params: ', params);
        const { payWeChatAppId, payWeChatMchId, payWeChatSecret, payWeChatPublicKey, payWeChatPrivateKey } = await this.globalConfigService.getConfigs([
            'payWeChatAppId',
            'payWeChatMchId',
            'payWeChatSecret',
            'payWeChatPublicKey',
            'payWeChatPrivateKey',
        ]);
        const pay = new this.WxPay({
            appid: payWeChatAppId,
            mchid: payWeChatMchId,
            publicKey: payWeChatPublicKey,
            privateKey: payWeChatPrivateKey,
        });
        try {
            if (params['event_type'] == 'TRANSACTION.SUCCESS') {
                const { ciphertext, associated_data, nonce } = params['resource'];
                const resource = pay.decipher_gcm(ciphertext, associated_data, nonce, payWeChatSecret);
                const order = await this.orderEntity.findOne({ where: { orderId: resource['out_trade_no'], status: 0 } });
                if (!order)
                    return 'failed';
                const status = resource['trade_state'] == 'SUCCESS' ? 1 : 2;
                const result = await this.orderEntity.update({ orderId: resource['out_trade_no'] }, { status, paydAt: new Date() });
                if (status === 1) {
                    await this.userBalanceService.addBalanceToOrder(order);
                }
                if (result.affected != 1)
                    return 'failed';
            }
            return 'success';
        }
        catch (error) {
            console.log('error: ', error);
            console.log('支付通知验证失败: ', error);
            return 'failed';
        }
    }
    async payWeChat(userId, orderId, payType = 'native') {
        var _a, _b, _c;
        console.log('payType: ', payType);
        const order = await this.orderEntity.findOne({ where: { userId, orderId } });
        if (!order)
            throw new common_1.HttpException('订单不存在!', common_1.HttpStatus.BAD_REQUEST);
        const goods = await this.cramiPackageEntity.findOne({ where: { id: order.goodsId } });
        if (!goods)
            throw new common_1.HttpException('套餐不存在!', common_1.HttpStatus.BAD_REQUEST);
        const { payWeChatAppId, payWeChatMchId, payWeChatPublicKey, payWeChatPrivateKey, payWeChatNotifyUrl, payWeChatH5Name, payWeChatH5Url } = await this.globalConfigService.getConfigs([
            'payWeChatAppId',
            'payWeChatMchId',
            'payWeChatPublicKey',
            'payWeChatPrivateKey',
            'payWeChatNotifyUrl',
            'payWeChatH5Name',
            'payWeChatH5Url',
        ]);
        const pay = new this.WxPay({
            appid: payWeChatAppId,
            mchid: payWeChatMchId,
            publicKey: payWeChatPublicKey,
            privateKey: payWeChatPrivateKey,
        });
        const params = {
            appid: payWeChatAppId,
            mchid: payWeChatMchId,
            description: goods.name,
            out_trade_no: orderId,
            notify_url: payWeChatNotifyUrl,
            amount: {
                total: Number(order.total * 100),
            },
            scene_info: {
                payer_client_ip: '192.168.1.100',
            },
        };
        console.log('wechat-pay: ', params);
        if (payType == 'h5') {
            params.scene_info.h5_info = {
                type: 'Wap',
                app_name: payWeChatH5Name,
                app_url: payWeChatH5Url,
            };
            const res = await pay.transactions_h5(params);
            if (res.status === 403) {
                const errmsg = (_c = (_b = (_a = res === null || res === void 0 ? void 0 : res.errRaw) === null || _a === void 0 ? void 0 : _a.response) === null || _b === void 0 ? void 0 : _b.text) === null || _c === void 0 ? void 0 : _c.message;
                throw new common_1.HttpException((res === null || res === void 0 ? void 0 : res.message) || '微信H5支付失败！', common_1.HttpStatus.BAD_REQUEST);
            }
            const { h5_url } = res;
            return { url: h5_url };
        }
        if (payType == 'jsapi') {
            const openid = await this.userService.getOpenIdByUserId(userId);
            console.log('用户openId: ', openid);
            params['payer'] = {
                openid: openid,
            };
            const result = await pay.transactions_jsapi(params);
            console.log('jsapi支付结果返回值: ', result);
            return result;
        }
        if (payType == 'native') {
            const res = await pay.transactions_native(params);
            const { code_url: url_qrcode } = res;
            if (!url_qrcode) {
                console.log('wx-native', res);
            }
            return { url_qrcode, isRedirect: false };
        }
        throw new common_1.HttpException('unsupported pay type', common_1.HttpStatus.BAD_REQUEST);
    }
    async queryWeChat(orderId) {
        const { payWeChatAppId, payWeChatMchId, payWeChatPublicKey, payWeChatPrivateKey, payWeChatNotifyUrl, payWeChatH5Name, payWeChatH5Url } = await this.globalConfigService.getConfigs(['payWeChatAppId', 'payWeChatMchId', 'payWeChatPublicKey', 'payWeChatPrivateKey']);
        const pay = new this.WxPay({
            appid: payWeChatAppId,
            mchid: payWeChatMchId,
            publicKey: payWeChatPublicKey,
            privateKey: payWeChatPrivateKey,
        });
        const result = await pay.query({ out_trade_no: orderId });
        return result;
    }
    sign(params, secret) {
        const str = Object.keys(params)
            .sort()
            .map((key) => `${key}=${params[key]}`)
            .join('&') + secret;
        return crypto.createHash('md5').update(str).digest('hex');
    }
};
PayService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, typeorm_1.InjectRepository)(cramiPackage_entity_1.CramiPackageEntity)),
    __param(1, (0, typeorm_1.InjectRepository)(order_entity_1.OrderEntity)),
    __metadata("design:paramtypes", [typeorm_2.Repository,
        typeorm_2.Repository,
        userBalance_service_1.UserBalanceService,
        globalConfig_service_1.GlobalConfigService,
        user_service_1.UserService])
], PayService);
exports.PayService = PayService;
