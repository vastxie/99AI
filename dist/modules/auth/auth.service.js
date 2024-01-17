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
exports.AuthService = void 0;
const globalConfig_service_1 = require("../globalConfig/globalConfig.service");
const verification_constant_1 = require("../../common/constants/verification.constant");
const verification_service_1 = require("./../verification/verification.service");
const common_1 = require("@nestjs/common");
const jwt_1 = require("@nestjs/jwt");
const user_service_1 = require("../user/user.service");
const mailer_service_1 = require("../mailer/mailer.service");
const user_constant_1 = require("../../common/constants/user.constant");
const userBalance_service_1 = require("../userBalance/userBalance.service");
const config_entity_1 = require("../globalConfig/config.entity");
const typeorm_1 = require("typeorm");
const typeorm_2 = require("@nestjs/typeorm");
const utils_1 = require("../../common/utils");
const os = require("os");
const redisCache_service_1 = require("../redisCache/redisCache.service");
const svgCaptcha = require("svg-captcha");
const bcrypt = require("bcryptjs");
let AuthService = class AuthService {
    constructor(configEntity, userService, jwtService, mailerService, verificationService, userBalanceService, redisCacheService, globalConfigService) {
        this.configEntity = configEntity;
        this.userService = userService;
        this.jwtService = jwtService;
        this.mailerService = mailerService;
        this.verificationService = verificationService;
        this.userBalanceService = userBalanceService;
        this.redisCacheService = redisCacheService;
        this.globalConfigService = globalConfigService;
    }
    async onModuleInit() {
        this.getIp();
    }
    async register(body, req) {
        await this.verificationService.verifyCaptcha(body);
        const user = await this.userService.createUserAndVerifycation(body, req);
        const { username, email, client, id } = user;
        const res = { username, email, id };
        client && (res.client = client);
        return res;
    }
    async registerByPhone(body, req) {
        const { username, password, phone, phoneCode, invitedBy } = body;
        await this.userService.verifyUserRegisterByPhone(body);
        const nameSpace = await this.globalConfigService.getNamespace();
        const key = `${nameSpace}:PHONECODE:${phone}`;
        const redisPhoneCode = await this.redisCacheService.get({ key });
        if (!redisPhoneCode) {
            throw new common_1.HttpException('验证码已过期、请重新发送！', common_1.HttpStatus.BAD_REQUEST);
        }
        if (phoneCode !== redisPhoneCode) {
            throw new common_1.HttpException('验证码填写错误、请重新输入！', common_1.HttpStatus.BAD_REQUEST);
        }
        const email = `${(0, utils_1.createRandomUid)()}@nine.com`;
        const newUser = { username, password, phone, invitedBy, email, status: user_constant_1.UserStatusEnum.ACTIVE };
        const userDefautlAvatar = await this.globalConfigService.getConfigs(['userDefautlAvatar']);
        newUser.avatar = userDefautlAvatar;
        const hashedPassword = bcrypt.hashSync(password, 10);
        newUser.password = hashedPassword;
        const u = await this.userService.createUser(newUser);
        let inviteUser;
        if (invitedBy) {
            inviteUser = await this.userService.qureyUserInfoByInviteCode(invitedBy);
        }
        await this.userBalanceService.addBalanceToNewUser(u.id, inviteUser === null || inviteUser === void 0 ? void 0 : inviteUser.id);
        return;
    }
    async login(user, req) {
        const u = await this.userService.verifyUserCredentials(user);
        const { username, id, email, role, openId, client } = u;
        const ip = (0, utils_1.getClientIp)(req);
        await this.userService.savaLoginIp(id, ip);
        const token = await this.jwtService.sign({ username, id, email, role, openId, client });
        await this.redisCacheService.saveToken(id, token);
        return token;
    }
    async loginByPhone(body, req) {
        const u = await this.userService.verifyUserCredentials(body);
        const { username, id, email, role, openId, client } = u;
        const ip = (0, utils_1.getClientIp)(req);
        await this.userService.savaLoginIp(id, ip);
        const { phone } = body;
        const token = await this.jwtService.sign({ username, id, email, role, openId, client, phone });
        await this.redisCacheService.saveToken(id, token);
        return token;
    }
    async loginByOpenId(user, req) {
        const { status } = user;
        if (status !== user_constant_1.UserStatusEnum.ACTIVE) {
            throw new common_1.HttpException(user_constant_1.UserStatusErrMsg[status], common_1.HttpStatus.BAD_REQUEST);
        }
        const { username, id, email, role, openId, client } = user;
        const ip = (0, utils_1.getClientIp)(req);
        await this.userService.savaLoginIp(id, ip);
        const token = await this.jwtService.sign({ username, id, email, role, openId, client });
        await this.redisCacheService.saveToken(id, token);
        return token;
    }
    async getInfo(req) {
        const { id } = req.user;
        return await this.userService.getUserInfo(id);
    }
    async activateAccount(params, res) {
        const emailConfigs = await this.configEntity.find({
            where: {
                configKey: (0, typeorm_1.In)([
                    'registerSuccessEmailTitle',
                    'registerSuccessEmailTeamName',
                    'registerSuccessEmaileAppend',
                    'registerFailEmailTitle',
                    'registerFailEmailTeamName',
                ]),
            },
        });
        const configMap = emailConfigs.reduce((pre, cur) => {
            pre[cur.configKey] = cur.configVal;
            return pre;
        }, {});
        try {
            const v = await this.verificationService.verifyCode(params, verification_constant_1.VerificationEnum.Registration);
            const { type, userId } = v;
            if (type !== verification_constant_1.VerificationEnum.Registration) {
                throw new common_1.HttpException('验证码类型错误', common_1.HttpStatus.BAD_REQUEST);
            }
            const status = await this.userService.getUserStatus(userId);
            if (status === user_constant_1.UserStatusEnum.ACTIVE) {
                throw new common_1.HttpException('账户已被激活过', common_1.HttpStatus.BAD_REQUEST);
            }
            await this.userService.updateUserStatus(v.userId, user_constant_1.UserStatusEnum.ACTIVE);
            const u = await this.userService.queryUserInfoById(v.userId);
            const { username, email, id, invitedBy } = u;
            let inviteUser;
            if (invitedBy) {
                inviteUser = await this.userService.qureyUserInfoByInviteCode(invitedBy);
            }
            await this.userBalanceService.addBalanceToNewUser(id, inviteUser === null || inviteUser === void 0 ? void 0 : inviteUser.id);
            res.redirect(`/api/auth/registerSuccess?id=${id.toString().padStart(4, '0')}&username=${username}&email=${email}&registerSuccessEmailTitle=${configMap.registerSuccessEmailTitle}&registerSuccessEmailTeamName=${configMap.registerSuccessEmailTeamName}&registerSuccessEmaileAppend=${configMap.registerSuccessEmaileAppend}`);
        }
        catch (error) {
            console.log('error: ', error);
            const message = error.response;
            res.redirect(`/api/auth/registerError?message=${message}&registerFailEmailTitle=${configMap.registerFailEmailTitle}&registerFailEmailTeamName=${configMap.registerFailEmailTeamName}`);
        }
    }
    async updatePassword(req, body) {
        const { id, client, role } = req.user;
        if (client && Number(client) > 0) {
            throw new common_1.HttpException('无权此操作、请联系管理员！', common_1.HttpStatus.BAD_REQUEST);
        }
        if (role === 'admin') {
            throw new common_1.HttpException('非法操作、请联系管理员！', common_1.HttpStatus.BAD_REQUEST);
        }
        const bool = await this.userService.verifyUserPassword(id, body.oldPassword);
        if (!bool) {
            throw new common_1.HttpException('旧密码错误、请检查提交', common_1.HttpStatus.BAD_REQUEST);
        }
        this.userService.updateUserPassword(id, body.password);
        return '密码修改成功';
    }
    async updatePassByOther(req, body) {
        const { id, client } = req.user;
        if (!client) {
            throw new common_1.HttpException('无权此操作！', common_1.HttpStatus.BAD_REQUEST);
        }
        this.userService.updateUserPassword(id, body.password);
        return '密码修改成功';
    }
    getIp() {
        let ipAddress;
        const interfaces = os.networkInterfaces();
        Object.keys(interfaces).forEach((interfaceName) => {
            const interfaceInfo = interfaces[interfaceName];
            for (let i = 0; i < interfaceInfo.length; i++) {
                const alias = interfaceInfo[i];
                if (alias.family === 'IPv4' && alias.address !== '127.0.0.1' && !alias.internal) {
                    ipAddress = alias.address;
                    break;
                }
            }
        });
        this.ipAddress = ipAddress;
    }
    async captcha(parmas) {
        const nameSpace = await this.globalConfigService.getNamespace();
        const { color = '#fff' } = parmas;
        const captcha = svgCaptcha.createMathExpr({ background: color, height: 34, width: 120, noise: 3 });
        const text = captcha.text;
        const randomId = (0, utils_1.createRandomUid)();
        const key = `${nameSpace}:CAPTCHA:${randomId}`;
        await this.redisCacheService.set({ key, val: captcha.text }, 5 * 60);
        return {
            svgCode: captcha.data,
            code: randomId,
        };
    }
    async sendPhoneCode(body) {
        await this.verificationService.verifyCaptcha(body);
        const { phone } = body;
        const nameSpace = await this.globalConfigService.getNamespace();
        const key = `${nameSpace}:PHONECODE:${phone}`;
        const ttl = await this.redisCacheService.ttl(key);
        if (ttl && ttl > 0) {
            throw new common_1.HttpException(`${ttl}秒内不得重复发送短信！`, common_1.HttpStatus.BAD_REQUEST);
        }
        const code = (0, utils_1.createRandomCode)();
        const messageInfo = { phone, code };
        await this.verificationService.sendPhoneCode(messageInfo);
        await this.redisCacheService.set({ key, val: code }, 1 * 60);
        return '验证码发送成功、请填写验证码完成注册！';
    }
    createTokenFromFingerprint(fingerprint) {
        const token = this.jwtService.sign({
            username: `游客${fingerprint}`,
            id: fingerprint,
            email: `${fingerprint}@nine.com`,
            role: 'visitor',
            openId: null,
            client: null,
        });
        return token;
    }
};
AuthService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, typeorm_2.InjectRepository)(config_entity_1.ConfigEntity)),
    __metadata("design:paramtypes", [typeorm_1.Repository,
        user_service_1.UserService,
        jwt_1.JwtService,
        mailer_service_1.MailerService,
        verification_service_1.VerificationService,
        userBalance_service_1.UserBalanceService,
        redisCache_service_1.RedisCacheService,
        globalConfig_service_1.GlobalConfigService])
], AuthService);
exports.AuthService = AuthService;
