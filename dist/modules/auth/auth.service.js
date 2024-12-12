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
const user_constant_1 = require("../../common/constants/user.constant");
const utils_1 = require("../../common/utils");
const globalConfig_service_1 = require("../globalConfig/globalConfig.service");
const common_1 = require("@nestjs/common");
const jwt_1 = require("@nestjs/jwt");
const typeorm_1 = require("@nestjs/typeorm");
const bcrypt = require("bcryptjs");
const os = require("os");
const typeorm_2 = require("typeorm");
const config_entity_1 = require("../globalConfig/config.entity");
const mailer_service_1 = require("../mailer/mailer.service");
const redisCache_service_1 = require("../redisCache/redisCache.service");
const user_service_1 = require("../user/user.service");
const userBalance_service_1 = require("../userBalance/userBalance.service");
const verification_service_1 = require("./../verification/verification.service");
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
        const { password, contact, code } = body;
        let email = '', phone = '';
        const isEmail = /\S+@\S+\.\S+/.test(contact);
        const isPhone = /^\d{10,}$/.test(contact);
        common_1.Logger.debug(`Contact: ${contact}, isEmail: ${isEmail}, isPhone: ${isPhone}`);
        let username = (0, utils_1.createRandomUid)();
        while (true) {
            const usernameTaken = await this.userService.verifyUserRegister({
                username,
            });
            common_1.Logger.debug(`Checking if username ${username} is taken: ${usernameTaken}`);
            if (usernameTaken) {
                break;
            }
            username = (0, utils_1.createRandomUid)();
        }
        if (isEmail) {
            email = contact;
            const isAvailable = await this.userService.verifyUserRegister({
                username,
                email,
            });
            common_1.Logger.debug(`Email ${email} is available: ${isAvailable}`);
            if (!isAvailable) {
                throw new common_1.HttpException('当前邮箱已注册，请勿重复注册！', common_1.HttpStatus.BAD_REQUEST);
            }
        }
        else if (isPhone) {
            phone = contact;
            const isAvailable = await this.userService.verifyUserRegister({
                username,
                phone,
            });
            common_1.Logger.debug(`Phone ${phone} is available: ${isAvailable}`);
            if (!isAvailable) {
                throw new common_1.HttpException('当前手机号已注册，请勿重复注册！', common_1.HttpStatus.BAD_REQUEST);
            }
        }
        else {
            throw new common_1.HttpException('请提供有效的邮箱地址或手机号码。', common_1.HttpStatus.BAD_REQUEST);
        }
        const noVerifyRegister = await this.globalConfigService.getConfigs([
            'noVerifyRegister',
        ]);
        common_1.Logger.debug(`noVerifyRegister: ${noVerifyRegister}`);
        if (noVerifyRegister !== '1') {
            const nameSpace = await this.globalConfigService.getNamespace();
            const key = `${nameSpace}:CODE:${contact}`;
            const redisCode = await this.redisCacheService.get({ key });
            common_1.Logger.debug(`Retrieved redisCode for ${contact}: ${redisCode}`);
            if (code === '') {
                throw new common_1.HttpException('请输入验证码', common_1.HttpStatus.BAD_REQUEST);
            }
            if (!redisCode) {
                common_1.Logger.log(`验证码过期: ${contact}`, 'authService');
                throw new common_1.HttpException('验证码已过期，请重新发送！', common_1.HttpStatus.BAD_REQUEST);
            }
            if (code !== redisCode) {
                common_1.Logger.log(`验证码错误: ${contact} 输入的验证码: ${code}, 期望的验证码: ${redisCode}`, 'authService');
                throw new common_1.HttpException('验证码填写错误，请重新输入！', common_1.HttpStatus.BAD_REQUEST);
            }
        }
        let newUser;
        if (isEmail) {
            newUser = {
                username,
                password,
                email: contact,
                status: user_constant_1.UserStatusEnum.ACTIVE,
            };
        }
        else {
            const email = `${(0, utils_1.createRandomUid)()}@aiweb.com`;
            newUser = {
                username,
                password,
                email,
                phone: contact,
                status: user_constant_1.UserStatusEnum.ACTIVE,
            };
        }
        common_1.Logger.debug('获取默认用户头像...');
        const userDefautlAvatar = await this.globalConfigService.getConfigs([
            'userDefautlAvatar',
        ]);
        common_1.Logger.debug(`使用默认用户头像: ${userDefautlAvatar}`);
        newUser.avatar = userDefautlAvatar;
        common_1.Logger.debug('加密用户密码...');
        const hashedPassword = bcrypt.hashSync(password, 10);
        newUser.password = hashedPassword;
        common_1.Logger.debug('保存新用户到数据库...');
        const u = await this.userService.createUser(newUser);
        common_1.Logger.debug(`用户创建成功，用户ID: ${u.id}`);
        await this.userBalanceService.addBalanceToNewUser(u.id);
        common_1.Logger.debug('完成新用户余额处理');
        return { success: true, message: '注册成功' };
    }
    async login(user, req) {
        console.log(`开始用户登录流程，用户名: ${user.username}`);
        const u = await this.userService.verifyUserCredentials(user);
        if (!u) {
            console.error(`登录失败: 用户凭证无效 - 用户名: ${user.username}`);
            throw new common_1.HttpException('登录失败，用户凭证无效。', common_1.HttpStatus.UNAUTHORIZED);
        }
        const { username, id, email, role, openId, client, phone } = u;
        console.log(`用户凭证验证成功，用户ID: ${id}, 用户名: ${username}`);
        const ip = (0, utils_1.getClientIp)(req);
        await this.userService.savaLoginIp(id, ip);
        console.log(`保存登录IP: ${ip} - 用户ID: ${id}`);
        const token = await this.jwtService.sign({
            username,
            id,
            email,
            role,
            openId,
            client,
            phone,
        });
        console.log(`JWT令牌生成成功 - 用户ID: ${id}`);
        await this.redisCacheService.saveToken(id, token);
        console.log(`令牌已保存到Redis - 用户ID: ${id}`);
        return token;
    }
    async loginWithCaptcha(body, req) {
        const { contact, code } = body;
        let email = '', phone = '';
        const isEmail = /\S+@\S+\.\S+/.test(contact);
        const isPhone = /^\d{10,}$/.test(contact);
        if (isEmail) {
            email = contact;
        }
        else if (isPhone) {
            phone = contact;
        }
        else {
            throw new common_1.HttpException('请提供有效的邮箱地址或手机号码。', common_1.HttpStatus.BAD_REQUEST);
        }
        const isAvailable = await this.userService.verifyUserRegister({
            email,
            phone,
        });
        const nameSpace = await this.globalConfigService.getNamespace();
        const key = `${nameSpace}:CODE:${contact}`;
        const redisCode = await this.redisCacheService.get({ key });
        if (!redisCode) {
            common_1.Logger.log(`验证码过期: ${contact}`, 'authService');
            throw new common_1.HttpException('验证码已过期，请重新发送！', common_1.HttpStatus.BAD_REQUEST);
        }
        if (code !== redisCode) {
            common_1.Logger.log(`验证码错误: ${contact} 输入的验证码: ${code}, 期望的验证码: ${redisCode}`, 'authService');
            throw new common_1.HttpException('验证码填写错误，请重新输入！', common_1.HttpStatus.BAD_REQUEST);
        }
        let u;
        if (isAvailable) {
            u = await this.userService.createUserFromContact({ email, phone });
        }
        else {
            u = await this.userService.getUserByContact({ email, phone });
        }
        if (!u) {
            throw new common_1.HttpException('登录失败，用户凭证无效。', common_1.HttpStatus.UNAUTHORIZED);
        }
        const { username, id, role, openId, client } = u;
        console.log(`用户凭证验证成功，用户ID: ${id}, 用户名: ${username}`);
        const ip = (0, utils_1.getClientIp)(req);
        await this.userService.savaLoginIp(id, ip);
        console.log(`保存登录IP: ${ip} - 用户ID: ${id}`);
        const token = await this.jwtService.sign({
            username,
            id,
            email,
            role,
            openId,
            client,
            phone,
        });
        console.log(`JWT令牌生成成功 - 用户ID: ${id}`);
        await this.redisCacheService.saveToken(id, token);
        console.log(`令牌已保存到Redis - 用户ID: ${id}`);
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
        const token = await this.jwtService.sign({
            username,
            id,
            email,
            role,
            openId,
            client,
        });
        await this.redisCacheService.saveToken(id, token);
        return token;
    }
    async getInfo(req) {
        const { id } = req.user;
        return await this.userService.getUserInfo(id);
    }
    async updatePassword(req, body) {
        const { id, client, role } = req.user;
        if (client && Number(client) > 0) {
            throw new common_1.HttpException('无权此操作、请联系管理员！', common_1.HttpStatus.BAD_REQUEST);
        }
        if (role === 'admin') {
            throw new common_1.HttpException('非法操作、请联系管理员！', common_1.HttpStatus.BAD_REQUEST);
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
                if (alias.family === 'IPv4' &&
                    alias.address !== '127.0.0.1' &&
                    !alias.internal) {
                    ipAddress = alias.address;
                    break;
                }
            }
        });
        this.ipAddress = ipAddress;
    }
    async sendCode(body) {
        const { contact, isLogin } = body;
        let email = '', phone = '';
        const code = (0, utils_1.createRandomCode)();
        const isEmail = /\S+@\S+\.\S+/.test(contact);
        const isPhone = /^\d{10,}$/.test(contact);
        if (!isEmail && !isPhone) {
            throw new common_1.HttpException('请提供有效的邮箱地址或手机号码。', common_1.HttpStatus.BAD_REQUEST);
        }
        if (!isLogin) {
            if (isEmail) {
                email = contact;
                const isAvailable = await this.userService.verifyUserRegister({
                    email,
                });
                if (!isAvailable) {
                    throw new common_1.HttpException('当前邮箱已注册，请勿重复注册！', common_1.HttpStatus.BAD_REQUEST);
                }
            }
            else if (isPhone) {
                phone = contact;
                const isAvailable = await this.userService.verifyUserRegister({
                    phone,
                });
                if (!isAvailable) {
                    throw new common_1.HttpException('当前手机号已注册，请勿重复注册！', common_1.HttpStatus.BAD_REQUEST);
                }
            }
        }
        const nameSpace = await this.globalConfigService.getNamespace();
        const key = `${nameSpace}:CODE:${contact}`;
        const ttl = await this.redisCacheService.ttl(key);
        if (ttl && ttl > 0 && isPhone) {
            throw new common_1.HttpException(`${ttl}秒内不得重复发送验证码！`, common_1.HttpStatus.BAD_REQUEST);
        }
        if (isEmail) {
            const existingCode = await this.redisCacheService.get({ key });
            if (existingCode) {
                await this.mailerService.sendMail({
                    to: email,
                    context: {
                        code: existingCode,
                    },
                });
                return `验证码发送成功、请填写验证码完成注册！`;
            }
            else {
                try {
                    await this.mailerService.sendMail({
                        to: email,
                        context: {
                            code: code,
                        },
                    });
                    console.log('邮件发送成功');
                }
                catch (error) {
                    console.error('邮件发送失败', error);
                }
                await this.redisCacheService.set({ key, val: code }, 10 * 60);
                return `验证码发送成功、请填写验证码完成注册！`;
            }
        }
        else if (isPhone) {
            const messageInfo = { phone, code };
            await this.verificationService.sendPhoneCode(messageInfo);
            await this.redisCacheService.set({ key, val: code }, 10 * 60);
            return `验证码发送成功、请填写验证码完成注册！`;
        }
    }
    async sendPhoneCode(body) {
        const { phone, isLogin } = body;
        const code = (0, utils_1.createRandomCode)();
        const isPhone = /^\d{10,}$/.test(phone);
        if (!isPhone) {
            throw new common_1.HttpException('请提供有效的邮箱地址或手机号码。', common_1.HttpStatus.BAD_REQUEST);
        }
        if (isLogin) {
            if (isPhone) {
                const isAvailable = await this.userService.verifyUserRegister({
                    phone,
                });
                if (!isAvailable) {
                    throw new common_1.HttpException('当前手机号已注册，请勿重复注册！', common_1.HttpStatus.BAD_REQUEST);
                }
            }
        }
        const nameSpace = await this.globalConfigService.getNamespace();
        const key = `${nameSpace}:CODE:${phone}`;
        const ttl = await this.redisCacheService.ttl(key);
        if (ttl && ttl > 0 && isPhone) {
            throw new common_1.HttpException(`${ttl}秒内不得重复发送验证码！`, common_1.HttpStatus.BAD_REQUEST);
        }
        const messageInfo = { phone, code };
        await this.redisCacheService.set({ key, val: code }, 10 * 60);
        await this.verificationService.sendPhoneCode(messageInfo);
        return `验证码发送成功、请填写验证码完成认证！`;
    }
    createTokenFromFingerprint(fingerprint) {
        const token = this.jwtService.sign({
            username: `游客${fingerprint}`,
            id: fingerprint,
            email: `${fingerprint}@visitor.com`,
            role: 'visitor',
            openId: null,
            client: null,
        });
        return token;
    }
    async verifyIdentity(req, body) {
        common_1.Logger.debug('开始实名认证流程');
        const { name, idCard } = body;
        const { id } = req.user;
        try {
            const result = await this.verificationService.verifyIdentity(body);
            common_1.Logger.debug(`实名认证结果: ${result}`);
            if (!result) {
                throw new common_1.HttpException('身份验证错误，请检查实名信息', common_1.HttpStatus.BAD_REQUEST);
            }
            await this.userService.saveRealNameInfo(id, name, idCard);
            return '认证成功';
        }
        catch (error) {
            common_1.Logger.error('验证过程出现错误', error);
            throw new common_1.HttpException('认证失败，请检查相关信息', common_1.HttpStatus.BAD_REQUEST);
        }
    }
    async verifyPhoneIdentity(req, body) {
        common_1.Logger.debug('开始手机号认证流程');
        const { phone, username, password, code } = body;
        const { id } = req.user;
        const nameSpace = this.globalConfigService.getNamespace();
        const key = `${nameSpace}:CODE:${phone}`;
        const redisCode = await this.redisCacheService.get({ key });
        common_1.Logger.debug(`Retrieved redisCode for ${phone}: ${redisCode}`);
        if (code === '') {
            throw new common_1.HttpException('请输入验证码', common_1.HttpStatus.BAD_REQUEST);
        }
        if (!redisCode) {
            common_1.Logger.log(`验证码过期: ${phone}`, 'authService');
            throw new common_1.HttpException('验证码已过期，请重新发送！', common_1.HttpStatus.BAD_REQUEST);
        }
        if (code !== redisCode) {
            common_1.Logger.log(`验证码错误: ${phone} 输入的验证码: ${code}, 期望的验证码: ${redisCode}`, 'authService');
            throw new common_1.HttpException('验证码填写错误，请重新输入！', common_1.HttpStatus.BAD_REQUEST);
        }
        if (username) {
            const usernameTaken = await this.userService.isUsernameTaken(body.username, id);
            if (usernameTaken) {
                throw new common_1.HttpException('用户名已存在！', common_1.HttpStatus.BAD_REQUEST);
            }
        }
        try {
            await this.userService.updateUserPhone(id, phone, username, password);
            return '认证成功';
        }
        catch (error) {
            common_1.Logger.error('验证过程出现错误', error);
            throw new common_1.HttpException('身份验证错误，请检查相关信息', common_1.HttpStatus.BAD_REQUEST);
        }
    }
};
AuthService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, typeorm_1.InjectRepository)(config_entity_1.ConfigEntity)),
    __metadata("design:paramtypes", [typeorm_2.Repository,
        user_service_1.UserService,
        jwt_1.JwtService,
        mailer_service_1.MailerService,
        verification_service_1.VerificationService,
        userBalance_service_1.UserBalanceService,
        redisCache_service_1.RedisCacheService,
        globalConfig_service_1.GlobalConfigService])
], AuthService);
exports.AuthService = AuthService;
