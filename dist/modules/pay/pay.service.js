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
const utils_1 = require("../../common/utils");
const common_1 = require("@nestjs/common");
const typeorm_1 = require("@nestjs/typeorm");
const axios_1 = require("axios");
const crypto = require("crypto");
const typeorm_2 = require("typeorm");
const cramiPackage_entity_1 = require("../crami/cramiPackage.entity");
const globalConfig_service_1 = require("../globalConfig/globalConfig.service");
const order_entity_1 = require("../order/order.entity");
const user_service_1 = require("../user/user.service");
const userBalance_service_1 = require("../userBalance/userBalance.service");
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
        if (params['attach'] == 'ltzf') {
            return this.notifyLtzf(params);
        }
        if (typeof params['resource'] == 'object') {
            return this.notifyWeChat(params);
        }
        return this.notifyMpay(params);
    }
    async pay(userId, orderId, payType = 'wxpay') {
        const order = await this.orderEntity.findOne({
            where: { userId, orderId },
        });
        if (!order)
            throw new common_1.HttpException('订单不存在!', common_1.HttpStatus.BAD_REQUEST);
        const goods = await this.cramiPackageEntity.findOne({
            where: { id: order.goodsId },
        });
        if (!goods)
            throw new common_1.HttpException('套餐不存在!', common_1.HttpStatus.BAD_REQUEST);
        common_1.Logger.log('本次支付类型: ', order.payPlatform);
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
            if (order.payPlatform == 'ltzf') {
                return this.payLtzf(userId, orderId, payType);
            }
        }
        catch (error) {
            common_1.Logger.log('支付请求失败: ', error);
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
        const payHupiSecret = await this.globalConfigService.getConfigs([
            'payHupiSecret',
        ]);
        const hash = params['hash'];
        delete params['hash'];
        if (this.sign(params, payHupiSecret) != hash)
            return 'failed';
        const order = await this.orderEntity.findOne({
            where: { orderId: params['trade_order_id'], status: 0 },
        });
        if (!order)
            return 'failed';
        await this.userBalanceService.addBalanceToOrder(order);
        const result = await this.orderEntity.update({ orderId: params['trade_order_id'] }, { status: 1, paydAt: new Date() });
        if (result.affected != 1)
            return 'failed';
        return 'success';
    }
    async payHupi(userId, orderId, payType = 'wxpay') {
        const order = await this.orderEntity.findOne({
            where: { userId, orderId },
        });
        if (!order)
            throw new common_1.HttpException('订单不存在!', common_1.HttpStatus.BAD_REQUEST);
        const goods = await this.cramiPackageEntity.findOne({
            where: { id: order.goodsId },
        });
        if (!goods)
            throw new common_1.HttpException('套餐不存在!', common_1.HttpStatus.BAD_REQUEST);
        const { payHupiAppId, payHupiSecret, payHupiNotifyUrl, payHupiReturnUrl, payHupiGatewayUrl, } = await this.globalConfigService.getConfigs([
            'payHupiAppId',
            'payHupiSecret',
            'payHupiNotifyUrl',
            'payHupiReturnUrl',
            'payHupiGatewayUrl',
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
        const { payHupiAppId, payHupiSecret } = await this.globalConfigService.getConfigs([
            'payHupiAppId',
            'payHupiSecret',
        ]);
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
        const payEpaySecret = await this.globalConfigService.getConfigs([
            'payEpaySecret',
        ]);
        if (this.sign(params, payEpaySecret) != sign)
            return 'failed';
        common_1.Logger.log('校验签名通过');
        const order = await this.orderEntity.findOne({
            where: { orderId: params['out_trade_no'], status: 0 },
        });
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
        const order = await this.orderEntity.findOne({
            where: { userId, orderId },
        });
        if (!order)
            throw new common_1.HttpException('订单不存在!', common_1.HttpStatus.BAD_REQUEST);
        const goods = await this.cramiPackageEntity.findOne({
            where: { id: order.goodsId },
        });
        if (!goods)
            throw new common_1.HttpException('套餐不存在!', common_1.HttpStatus.BAD_REQUEST);
        const { payEpayPid, payEpaySecret, payEpayNotifyUrl, payEpayReturnUrl, payEpayApiPayUrl, } = await this.globalConfigService.getConfigs([
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
            return {
                url_qrcode: null,
                redirectUrl: apiUrl,
                channel: payType,
                isRedirect: true,
            };
        }
        else {
            const config = {
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                },
            };
            const res = await axios_1.default.post(payEpayApiPayUrl, params, config);
            common_1.Logger.log('epay ---> res: ', res.data);
            const { data: { code, msg, qrcode: url_qrcode }, } = res;
            if (code != 1)
                throw new common_1.HttpException(msg, common_1.HttpStatus.BAD_REQUEST);
            return {
                url_qrcode,
                redirectUrl: null,
                channel: payType,
                isRedirect: false,
            };
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
        const payMpaySecret = await this.globalConfigService.getConfigs([
            'payMpaySecret',
        ]);
        common_1.Logger.log('校验签名');
        if (this.sign(params, payMpaySecret) != sign)
            return 'failed';
        common_1.Logger.log('校验签名通过');
        const order = await this.orderEntity.findOne({
            where: { orderId: params['out_trade_no'], status: 0 },
        });
        if (!order)
            return 'failed';
        const status = params['trade_status'] == 'TRADE_SUCCESS' ? 1 : 2;
        common_1.Logger.log('status: ', status);
        const result = await this.orderEntity.update({ orderId: params['out_trade_no'] }, { status, paydAt: new Date() });
        if (status === 1) {
            await this.userBalanceService.addBalanceToOrder(order);
        }
        if (result.affected != 1)
            return 'failed';
        return 'success';
    }
    async payMpay(userId, orderId, payType = 'wxpay') {
        const order = await this.orderEntity.findOne({
            where: { userId, orderId },
        });
        if (!order)
            throw new common_1.HttpException('订单不存在!', common_1.HttpStatus.BAD_REQUEST);
        const goods = await this.cramiPackageEntity.findOne({
            where: { id: order.goodsId },
        });
        if (!goods)
            throw new common_1.HttpException('套餐不存在!', common_1.HttpStatus.BAD_REQUEST);
        const { payMpayPid, payMpaySecret, payMpayNotifyUrl, payMpayReturnUrl, payMpayApiPayUrl, } = await this.globalConfigService.getConfigs([
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
        return {
            url_qrcode: null,
            redirectUrl: apiUrl,
            channel: payType,
            isRedirect: true,
        };
        const res = await axios_1.default.get(payMpayApiPayUrl, { params });
    }
    async queryMpay(orderId) {
        const { payMpayApiQueryUrl } = await this.globalConfigService.getConfigs([
            'payMpayPid',
            'payMpaySecret',
            'payMpayApiQueryUrl',
        ]);
        const params = {};
        params['type'] = 2;
        params['order_no'] = orderId;
        const { data: { code, msg, data: result }, } = await axios_1.default.get(payMpayApiQueryUrl, { params });
        if (code != 1)
            throw new common_1.HttpException(msg, common_1.HttpStatus.BAD_REQUEST);
        return result;
    }
    async notifyWeChat(params) {
        common_1.Logger.log('微信支付通知params: ', params);
        const { payWeChatAppId, payWeChatMchId, payWeChatSecret, payWeChatPublicKey, payWeChatPrivateKey, } = await this.globalConfigService.getConfigs([
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
                const order = await this.orderEntity.findOne({
                    where: { orderId: resource['out_trade_no'], status: 0 },
                });
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
            common_1.Logger.log('error: ', error);
            common_1.Logger.log('支付通知验证失败: ', error);
            return 'failed';
        }
    }
    async payWeChat(userId, orderId, payType = 'native') {
        var _a, _b, _c, _d, _e, _f, _g;
        common_1.Logger.log('payType: ', payType);
        const order = await this.orderEntity.findOne({
            where: { userId, orderId },
        });
        if (!order)
            throw new common_1.HttpException('订单不存在!', common_1.HttpStatus.BAD_REQUEST);
        const goods = await this.cramiPackageEntity.findOne({
            where: { id: order.goodsId },
        });
        if (!goods)
            throw new common_1.HttpException('套餐不存在!', common_1.HttpStatus.BAD_REQUEST);
        const { payWeChatAppId, payWeChatMchId, payWeChatPublicKey, payWeChatPrivateKey, payWeChatNotifyUrl, } = await this.globalConfigService.getConfigs([
            'payWeChatAppId',
            'payWeChatMchId',
            'payWeChatPublicKey',
            'payWeChatPrivateKey',
            'payWeChatNotifyUrl',
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
                total: Math.round(order.total * 100),
            },
        };
        common_1.Logger.log('wechat-pay: ', params);
        if (payType == 'jsapi') {
            common_1.Logger.log(`[WeChat Pay JSAPI] 开始JSAPI支付流程，用户ID: ${userId}, 订单ID: ${orderId}`);
            const openid = await this.userService.getOpenIdByUserId(userId);
            common_1.Logger.log(`[WeChat Pay JSAPI] 用户OpenID: ${openid}`);
            params['payer'] = { openid: openid };
            common_1.Logger.log(`[WeChat Pay JSAPI] 发送支付请求参数: `, JSON.stringify(params, null, 2));
            try {
                const response = await pay.transactions_jsapi(params);
                const result = response.data ? response.data : response;
                common_1.Logger.log(`[WeChat Pay JSAPI] 支付请求成功，返回结果: `, JSON.stringify(result, null, 2));
                return {
                    status: response.status || 'unknown',
                    appId: result.appId || ((_a = result.data) === null || _a === void 0 ? void 0 : _a.appId),
                    timeStamp: result.timeStamp || ((_b = result.data) === null || _b === void 0 ? void 0 : _b.timeStamp),
                    nonceStr: result.nonceStr || ((_c = result.data) === null || _c === void 0 ? void 0 : _c.nonceStr),
                    package: result.package || ((_d = result.data) === null || _d === void 0 ? void 0 : _d.package),
                    signType: result.signType || ((_e = result.data) === null || _e === void 0 ? void 0 : _e.signType),
                    paySign: result.paySign || ((_f = result.data) === null || _f === void 0 ? void 0 : _f.paySign),
                };
            }
            catch (error) {
                console.error(`[WeChat Pay JSAPI] 支付请求过程中发生错误: ${error.message}`, error);
                console.error('[WeChat Pay JSAPI] 完整的错误对象：', error);
                throw new common_1.HttpException('JSAPI支付失败', common_1.HttpStatus.BAD_REQUEST);
            }
        }
        if (payType == 'native') {
            common_1.Logger.log(`开始进行微信Native支付流程，订单ID: ${orderId}, 用户ID: ${userId}`);
            try {
                const res = await pay.transactions_native(params);
                common_1.Logger.log(`微信Native支付响应数据: `, JSON.stringify(res, null, 2));
                let url_qrcode = res.code_url || ((_g = res.data) === null || _g === void 0 ? void 0 : _g.code_url);
                if (!url_qrcode) {
                    console.error(`微信Native支付请求成功，但未返回code_url，响应数据: `, JSON.stringify(res, null, 2));
                }
                else {
                    common_1.Logger.log(`微信Native支付请求成功，code_url: ${url_qrcode}`);
                }
                return { url_qrcode, isRedirect: false };
            }
            catch (error) {
                console.error(`微信Native支付过程中发生错误，错误信息: ${error.message}`, error);
                console.error('完整的错误对象：', error);
                throw new common_1.HttpException('微信Native支付失败', common_1.HttpStatus.BAD_REQUEST);
            }
        }
        else {
            console.warn(`支付请求使用了不支持的支付类型: ${payType}`);
            throw new common_1.HttpException('unsupported pay type', common_1.HttpStatus.BAD_REQUEST);
        }
    }
    async queryWeChat(orderId) {
        const { payWeChatAppId, payWeChatMchId, payWeChatPublicKey, payWeChatPrivateKey, payWeChatNotifyUrl, } = await this.globalConfigService.getConfigs([
            'payWeChatAppId',
            'payWeChatMchId',
            'payWeChatPublicKey',
            'payWeChatPrivateKey',
        ]);
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
    ltzfSign(params, secret) {
        const paramsArr = Object.keys(params);
        paramsArr.sort();
        const stringArr = [];
        paramsArr.map((key) => {
            stringArr.push(key + '=' + params[key]);
        });
        stringArr.push('key=' + secret);
        const str = stringArr.join('&');
        return crypto.createHash('md5').update(str).digest('hex').toUpperCase();
    }
    async payLtzf(userId, orderId, payType = 'wxpay') {
        const order = await this.orderEntity.findOne({
            where: { userId, orderId },
        });
        if (!order)
            throw new common_1.HttpException('订单不存在!', common_1.HttpStatus.BAD_REQUEST);
        const goods = await this.cramiPackageEntity.findOne({
            where: { id: order.goodsId },
        });
        if (!goods)
            throw new common_1.HttpException('套餐不存在!', common_1.HttpStatus.BAD_REQUEST);
        const { payLtzfMchId, payLtzfSecret, payLtzfNotifyUrl, payLtzfReturnUrl } = await this.globalConfigService.getConfigs([
            'payLtzfMchId',
            'payLtzfSecret',
            'payLtzfNotifyUrl',
            'payLtzfReturnUrl',
        ]);
        const params = {};
        params['mch_id'] = payLtzfMchId;
        params['timestamp'] = (Date.now() / 1000).toFixed(0);
        params['out_trade_no'] = orderId;
        params['body'] = goods.name;
        params['total_fee'] = order.total;
        params['notify_url'] = payLtzfNotifyUrl;
        params['sign'] = this.ltzfSign(params, payLtzfSecret);
        params['attach'] = 'ltzf';
        params['return_url'] = payLtzfReturnUrl;
        const formBody = Object.keys(params)
            .map((key) => encodeURIComponent(key) + '=' + encodeURIComponent(params[key]))
            .join('&');
        const config = {
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
            },
        };
        const response = await axios_1.default.post('https://api.ltzf.cn/api/wxpay/jsapi_convenient', formBody, config);
        const { code, data, msg } = response.data;
        if (code != 0)
            throw new common_1.HttpException(msg, common_1.HttpStatus.BAD_REQUEST);
        const url_qrcode = data.QRcode_url;
        const url = data.order_url;
        return { url_qrcode, url };
    }
    async queryLtzf(orderId) {
        const { payLtzfMchId, payLtzfSecret } = await this.globalConfigService.getConfigs([
            'payLtzfMchId',
            'payLtzfSecret',
        ]);
        const params = {};
        params['mch_id'] = payLtzfMchId;
        params['timestamp'] = (Date.now() / 1000).toFixed(0);
        params['out_trade_no'] = orderId;
        params['sign'] = this.ltzfSign(params, payLtzfSecret);
        const formBody = Object.keys(params)
            .map((key) => encodeURIComponent(key) + '=' + encodeURIComponent(params[key]))
            .join('&');
        const config = {
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
            },
        };
        const { data: { code, msg, data: result }, } = await axios_1.default.post('https://api.ltzf.cn/api/wxpay/get_pay_order', formBody, config);
        if (code != 0)
            throw new common_1.HttpException(msg + JSON.stringify(params), common_1.HttpStatus.BAD_REQUEST);
        return result;
    }
    async notifyLtzf(params) {
        const payLtzfSecret = await this.globalConfigService.getConfigs([
            'payLtzfSecret',
        ]);
        const hash = params['sign'];
        delete params['sign'];
        delete params['pay_channel'];
        delete params['trade_type'];
        delete params['success_time'];
        delete params['attach'];
        delete params['openid'];
        if (this.ltzfSign(params, payLtzfSecret) != hash)
            return 'FAIL';
        const order = await this.orderEntity.findOne({
            where: { orderId: params['out_trade_no'], status: 0 },
        });
        if (!order)
            return 'FAIL';
        await this.userBalanceService.addBalanceToOrder(order);
        const result = await this.orderEntity.update({ orderId: params['out_trade_no'] }, { status: 1, paydAt: new Date() });
        if (result.affected != 1)
            return 'FAIL';
        return 'SUCCESS';
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
