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
exports.UserService = void 0;
const balance_constant_1 = require("../../common/constants/balance.constant");
const verification_constant_1 = require("../../common/constants/verification.constant");
const utils_1 = require("../../common/utils");
const mailer_service_1 = require("../mailer/mailer.service");
const common_1 = require("@nestjs/common");
const typeorm_1 = require("@nestjs/typeorm");
const bcrypt = require("bcryptjs");
const _ = require("lodash");
const typeorm_2 = require("typeorm");
const whiteList_entity_1 = require("../chat/whiteList.entity");
const config_entity_1 = require("../globalConfig/config.entity");
const userBalance_service_1 = require("../userBalance/userBalance.service");
const user_constant_1 = require("./../../common/constants/user.constant");
const globalConfig_service_1 = require("./../globalConfig/globalConfig.service");
const verification_service_1 = require("./../verification/verification.service");
const user_entity_1 = require("./user.entity");
let UserService = class UserService {
    constructor(userEntity, whiteListEntity, connection, verificationService, mailerService, userBalanceService, globalConfigService, configEntity) {
        this.userEntity = userEntity;
        this.whiteListEntity = whiteListEntity;
        this.connection = connection;
        this.verificationService = verificationService;
        this.mailerService = mailerService;
        this.userBalanceService = userBalanceService;
        this.globalConfigService = globalConfigService;
        this.configEntity = configEntity;
    }
    async createUserAndVerifycation(user, req) {
        const { username, email, password, invitedBy, client = 0 } = user;
        if (invitedBy) {
            const b = await this.userEntity.findOne({ where: { inviteCode: invitedBy } });
            if (!b) {
                throw new common_1.HttpException('无效的邀请码！', common_1.HttpStatus.BAD_REQUEST);
            }
        }
        const where = [{ username }, { email }];
        const u = await this.userEntity.findOne({ where: where });
        if (u && u.status !== user_constant_1.UserStatusEnum.PENDING) {
            throw new common_1.HttpException('用户名或者邮箱已被注册！', common_1.HttpStatus.BAD_REQUEST);
        }
        try {
            const userInput = _.cloneDeep(user);
            const hashedPassword = bcrypt.hashSync(password, 10);
            const ip = (0, utils_1.getClientIp)(req);
            userInput.password = hashedPassword;
            userInput.registerIp = ip;
            userInput.client = client;
            let n;
            if (!u) {
                const userDefautlAvatar = await this.globalConfigService.getConfigs(['userDefautlAvatar']);
                userInput.avatar = userDefautlAvatar;
                n = await this.userEntity.save(userInput);
            }
            else {
                n = u;
            }
            const emailConfigs = await this.configEntity.find({
                where: {
                    configKey: (0, typeorm_2.In)([
                        'isVerifyEmail',
                        'registerBaseUrl',
                        'registerVerifyEmailTitle',
                        'registerVerifyEmailDesc',
                        'registerVerifyEmailFrom',
                        'registerVerifyExpir',
                    ]),
                },
            });
            const configMap = emailConfigs.reduce((pre, cur) => {
                pre[cur.configKey] = cur.configVal;
                return pre;
            }, {});
            const isVerifyEmail = configMap['isVerifyEmail'] ? Number(configMap['isVerifyEmail']) : 1;
            if (isVerifyEmail) {
                const expir = configMap['registerVerifyExpir'] ? Number(configMap['registerVerifyExpir']) : 30 * 60;
                const v = await this.verificationService.createVerification(n, verification_constant_1.VerificationEnum.Registration, expir);
                const { code, email, id } = v;
                const { registerVerifyEmailFrom } = configMap;
                console.log('configMap: ', configMap);
                console.log(`尝试发送邮件到: ${email}`);
            }
            else {
                const { username, email, id, invitedBy } = n;
                await this.updateUserStatus(id, user_constant_1.UserStatusEnum.ACTIVE);
                let inviteUser;
                if (invitedBy) {
                    inviteUser = await this.qureyUserInfoByInviteCode(invitedBy);
                }
                await this.userBalanceService.addBalanceToNewUser(id, inviteUser === null || inviteUser === void 0 ? void 0 : inviteUser.id);
            }
            return n;
        }
        catch (error) {
            console.log('error: ', error);
            throw error;
        }
    }
    async getSuper() {
        const user = await this.userEntity.findOne({ where: { role: 'super' } });
        return user;
    }
    async verifyUserCredentials(user) {
        const { username, password, uid = 0, phone } = user;
        let u = null;
        if (uid > 0) {
            u = await this.userEntity.findOne({ where: { id: uid } });
            if (!u) {
                throw new common_1.HttpException('当前账户不存在！', common_1.HttpStatus.BAD_REQUEST);
            }
            if (!bcrypt.compareSync(password, u.password)) {
                throw new common_1.HttpException('当前密码错误！', common_1.HttpStatus.BAD_REQUEST);
            }
        }
        if (username && password) {
            const where = [{ username }, { email: username }, { phone: username }];
            u = await this.userEntity.findOne({ where: where });
            if (!u) {
                throw new common_1.HttpException('当前账户不存在！', common_1.HttpStatus.BAD_REQUEST);
            }
            if (!bcrypt.compareSync(password, u.password)) {
                throw new common_1.HttpException('当前密码错误！', common_1.HttpStatus.BAD_REQUEST);
            }
        }
        if (!u) {
            throw new common_1.HttpException('当前账户不存在！', common_1.HttpStatus.BAD_REQUEST);
        }
        if (u.status !== user_constant_1.UserStatusEnum.ACTIVE) {
            throw new common_1.HttpException(user_constant_1.UserStatusErrMsg[u.status], common_1.HttpStatus.BAD_REQUEST);
        }
        return u;
    }
    async verifyUserPassword(userId, password) {
        const u = await this.userEntity.findOne({ where: { id: userId } });
        return bcrypt.compareSync(password, u.password);
    }
    async updateUserStatus(id, status) {
        const u = await this.userEntity.update({ id }, { status });
        return u.affected > 0;
    }
    async getUserStatus(id) {
        const u = await this.userEntity.findOne({ where: { id } });
        return u.status;
    }
    async queryUserInfoById(id) {
        return await this.userEntity.findOne({ where: { id } });
    }
    async queryOneUserInfo(userId) {
        return await this.userEntity.findOne({ where: { id: userId } });
    }
    async checkUserStatus(user) {
        const { id: userId, role } = user;
        if (role === 'visitor')
            return true;
        const u = await this.userEntity.findOne({ where: { id: userId } });
        if (!u) {
            throw new common_1.HttpException('当前用户信息失效、请重新登录！', common_1.HttpStatus.UNAUTHORIZED);
        }
        if (u.status === user_constant_1.UserStatusEnum.BLACKLISTED) {
            throw new common_1.HttpException('您的账户已被永久加入黑名单、如有疑问、请联系管理员！', common_1.HttpStatus.BAD_REQUEST);
        }
        if (u.status === user_constant_1.UserStatusEnum.LOCKED) {
            throw new common_1.HttpException('您的账户已被封禁、如有疑问、请联系管理员！', common_1.HttpStatus.BAD_REQUEST);
        }
    }
    async getUserInfo(userId) {
        const userInfo = await this.userEntity.findOne({
            where: { id: userId },
            select: ['username', 'avatar', 'role', 'email', 'sign', 'inviteCode', 'openId', 'consecutiveDays'],
        });
        if (!userInfo) {
            throw new common_1.HttpException('当前用户信息失效、请重新登录！', common_1.HttpStatus.UNAUTHORIZED);
        }
        userInfo.isBindWx = !!(userInfo === null || userInfo === void 0 ? void 0 : userInfo.openId);
        delete userInfo.openId;
        const userBalance = await this.userBalanceService.queryUserBalance(userId);
        return { userInfo, userBalance: Object.assign({}, userBalance) };
    }
    async getUserById(id) {
        return await this.userEntity.findOne({ where: { id } });
    }
    async getUserOpenId(openId) {
        return await this.userEntity.findOne({ where: { openId } });
    }
    async updateInfo(body, req) {
        const { id } = req.user;
        const u = await this.userEntity.findOne({ where: { id } });
        if (!u) {
            throw new common_1.HttpException('当前用户不存在！', common_1.HttpStatus.BAD_REQUEST);
        }
        if (body.username && u.username === body.username) {
            throw new common_1.HttpException('没有变更，无需更改！', common_1.HttpStatus.BAD_REQUEST);
        }
        if (body.username) {
            const u = await this.userEntity.findOne({ where: { username: body.username, id: (0, typeorm_2.Not)(id) } });
            if (u) {
                throw new common_1.HttpException('用户名已存在！', common_1.HttpStatus.BAD_REQUEST);
            }
        }
        const r = await this.userEntity.update({ id }, body);
        if (r.affected <= 0) {
            throw new common_1.HttpException('修改用户信息失败！', common_1.HttpStatus.BAD_REQUEST);
        }
        return '修改用户信息成功！';
    }
    async updateUserPassword(userId, password) {
        const hashedPassword = bcrypt.hashSync(password, 10);
        const r = await this.userEntity.update({ id: userId }, { password: hashedPassword });
        if (r.affected <= 0) {
            throw new common_1.HttpException('修改密码失败、请重新试试吧。', common_1.HttpStatus.BAD_REQUEST);
        }
    }
    async genInviteCode(req) {
        const { id } = req.user;
        const u = await this.userEntity.findOne({ where: { id } });
        if (!u || u.inviteCode) {
            throw new common_1.HttpException('已生成过邀请码、请勿重复生成', common_1.HttpStatus.BAD_REQUEST);
        }
        const inviteCode = (0, utils_1.generateRandomString)();
        const user = await this.userEntity.findOne({ where: { inviteCode } });
        if (user) {
            throw new common_1.HttpException('生成邀请码失败，请重新试一次吧！', common_1.HttpStatus.BAD_REQUEST);
        }
        const r = await this.userEntity.update({ id }, { inviteCode });
        if (r.affected <= 0) {
            throw new common_1.HttpException('生成邀请码失败，请重新试一次吧！', common_1.HttpStatus.BAD_REQUEST);
        }
        return inviteCode;
    }
    async getInviteRecord(req, query) {
        try {
            const { id } = req.user;
            const { page = 1, size = 10 } = query;
            const u = await this.userEntity.findOne({ where: { id } });
            const { inviteCode } = u;
            if (!inviteCode)
                return [];
            const invitedBy = inviteCode;
            const [rows, count] = await this.userEntity.findAndCount({
                where: { invitedBy },
                order: { id: 'DESC' },
                select: ['username', 'email', 'createdAt', 'status', 'avatar', 'updatedAt'],
                take: size,
                skip: (page - 1) * size,
            });
            (0, utils_1.formatCreateOrUpdateDate)(rows).map((t) => {
                t.email = (0, utils_1.maskEmail)(t.email);
                return t;
            });
            return { rows, count };
        }
        catch (error) {
            console.log('error: ', error);
            throw new common_1.HttpException('获取邀请记录失败！', common_1.HttpStatus.BAD_REQUEST);
        }
    }
    async inviteLink(code) {
        const u = await this.userEntity.findOne({ where: { inviteCode: code } });
        if (!u)
            return 1;
        const { inviteLinkCount = 0 } = u;
        const res = await this.userEntity.update({ inviteCode: code }, { inviteLinkCount: inviteLinkCount + 1 });
        if (res.affected) {
            return 1;
        }
        else {
            return 0;
        }
    }
    async qureyUserInfoByInviteCode(inviteCode) {
        return await this.userEntity.findOne({ where: { inviteCode } });
    }
    async userRecharge(body) {
        const { userId, model3Count = 0, model4Count = 0, drawMjCount = 0 } = body;
        await this.userBalanceService.addBalanceToUser(userId, { model3Count, model4Count, drawMjCount });
        const res = await this.userBalanceService.saveRecordRechargeLog({
            userId,
            rechargeType: balance_constant_1.RechargeType.ADMIN_GIFT,
            model3Count,
            model4Count,
            drawMjCount,
            extent: '',
        });
        return res;
    }
    async queryAll(query, req) {
        const { page = 1, size = 10, username, email, status, keyword, phone } = query;
        let where = {};
        username && Object.assign(where, { username: (0, typeorm_2.Like)(`%${username}%`) });
        email && Object.assign(where, { email: (0, typeorm_2.Like)(`%${email}%`) });
        phone && Object.assign(where, { phone: (0, typeorm_2.Like)(`%${phone}%`) });
        status && Object.assign(where, { status });
        if (keyword) {
            where = [{ username: (0, typeorm_2.Like)(`%${keyword}%`) }, { email: (0, typeorm_2.Like)(`%${keyword}%`) }, { phone: (0, typeorm_2.Like)(`%${keyword}%`) }];
        }
        const [rows, count] = await this.userEntity.findAndCount({
            skip: (page - 1) * size,
            where,
            take: size,
            order: { createdAt: 'DESC' },
            cache: true,
            select: ['username', 'avatar', 'inviteCode', 'role', 'sign', 'status', 'id', 'email', 'createdAt', 'lastLoginIp', 'phone'],
        });
        const ids = rows.map((t) => t.id);
        const data = await this.userBalanceService.queryUserBalanceByIds(ids);
        rows.forEach((user) => (user.balanceInfo = data.find((t) => t.userId === user.id)));
        req.user.role !== 'super' && rows.forEach((t) => (t.email = (0, utils_1.maskEmail)(t.email)));
        req.user.role !== 'super' && rows.forEach((t) => (t.lastLoginIp = (0, utils_1.maskIpAddress)(t.lastLoginIp)));
        req.user.role !== 'super' && rows.forEach((t) => (t.phone = (0, utils_1.maskIpAddress)(t.phone)));
        return { rows, count };
    }
    async queryOne({ id }) {
        return await this.userEntity.findOne({ where: { id }, select: ['username', 'avatar', 'inviteCode', 'role', 'sign', 'status'] });
    }
    async updateStatus(body) {
        const { id, status } = body;
        const n = await this.userEntity.findOne({ where: { id } });
        if (!n) {
            throw new common_1.HttpException('用户不存在！', common_1.HttpStatus.BAD_REQUEST);
        }
        if (n.role === 'super') {
            throw new common_1.HttpException('超级管理员不可被操作！', common_1.HttpStatus.BAD_REQUEST);
        }
        if (n.role === 'super') {
            throw new common_1.HttpException('超级管理员不可被操作！', common_1.HttpStatus.BAD_REQUEST);
        }
        const r = await this.userEntity.update({ id }, { status });
        if (r.affected <= 0) {
            throw new common_1.HttpException('修改用户状态失败！', common_1.HttpStatus.BAD_REQUEST);
        }
        return '修改用户状态成功！';
    }
    async resetUserPass(body) {
        const { id } = body;
        const u = await this.userEntity.findOne({ where: { id } });
        if (!u) {
            throw new common_1.HttpException('用户不存在！', common_1.HttpStatus.BAD_REQUEST);
        }
        const defaultPassword = '123456';
        const hashPassword = bcrypt.hashSync(defaultPassword, 10);
        const raw = await this.userEntity.update({ id }, { password: hashPassword });
        if (raw.affected <= 0) {
            throw new common_1.HttpException('重置密码失败！', common_1.HttpStatus.BAD_REQUEST);
        }
        return `密码重置为[${defaultPassword}]成功!`;
    }
    async savaLoginIp(userId, ip) {
        return await this.userEntity.update({ id: userId }, { lastLoginIp: ip });
    }
    async getUserFromOpenId(openId, sceneStr) {
        const user = await this.userEntity.findOne({ where: { openId } });
        if (!user) {
            const inviteCode = sceneStr ? sceneStr.split(':')[1] : '';
            const inviteUser = await this.qureyUserInfoByInviteCode(inviteCode);
            const user = await this.createUserFromOpenId(openId, inviteCode);
            await this.userBalanceService.addBalanceToNewUser(user.id, inviteCode ? inviteUser === null || inviteUser === void 0 ? void 0 : inviteUser.id : null);
            return user;
        }
        return user;
    }
    async createUserFromOpenId(openId, invitedBy) {
        const userDefautlAvatar = await this.globalConfigService.getConfigs(['userDefautlAvatar']);
        const userInfo = {
            avatar: userDefautlAvatar,
            username: `用户${(0, utils_1.createRandomUid)()}`,
            status: user_constant_1.UserStatusEnum.ACTIVE,
            sex: 0,
            email: `${(0, utils_1.createRandomUid)()}@default.com`,
            invitedBy,
            openId,
        };
        const user = await this.userEntity.save(userInfo);
        return user;
    }
    async bindWx(openId, userId) {
        try {
            const user = await this.userEntity.findOne({ where: { id: userId } });
            if (!user)
                return { status: false, msg: '当前绑定用户不存在！' };
            const bindU = await this.userEntity.findOne({ where: { openId } });
            if (bindU)
                return { status: false, msg: '该微信已绑定其他账号！' };
            const res = await this.userEntity.update({ id: userId }, { openId });
            if (res.affected <= 0)
                return { status: false, msg: '绑定微信失败、请联系管理员！' };
            return { status: true, msg: '恭喜您绑定成功、后续可直接扫码登录了！' };
        }
        catch (error) {
            return { status: false, msg: '绑定微信失败、请联系管理员！' };
        }
    }
    async getOpenIdByUserId(userId) {
        const user = await this.userEntity.findOne({ where: { id: userId } });
        return user === null || user === void 0 ? void 0 : user.openId;
    }
    async verifyUserRegister(params) {
        const { username, phone, email } = params;
        if (phone) {
            const userByPhone = await this.userEntity.findOne({ where: { phone } });
            if (userByPhone) {
                throw new common_1.HttpException('当前手机号已注册、请勿重复注册！', common_1.HttpStatus.BAD_REQUEST);
            }
        }
        if (email) {
            const userByEmail = await this.userEntity.findOne({ where: { email } });
            if (userByEmail) {
                throw new common_1.HttpException('当前邮箱已注册、请勿重复注册！', common_1.HttpStatus.BAD_REQUEST);
            }
        }
        const userByUsername = await this.userEntity.findOne({ where: { username } });
        if (userByUsername) {
            throw new common_1.HttpException('用户名已存在、请更换用户名！', common_1.HttpStatus.BAD_REQUEST);
        }
    }
    async verifyUserRegisterByPhone(params) {
        const { username, password, phone, phoneCode } = params;
        const user = await this.userEntity.findOne({ where: [{ username }, { phone }] });
        if (user && user.username === username) {
            throw new common_1.HttpException('用户名已存在、请更换用户名！', common_1.HttpStatus.BAD_REQUEST);
        }
        if (user && user.phone === phone) {
            throw new common_1.HttpException('当前手机号已注册、请勿重复注册！', common_1.HttpStatus.BAD_REQUEST);
        }
    }
    async verifyUserRegisterByEmail(params) {
        const { username, email } = params;
        console.log(`校验邮箱注册: 开始 - 用户名: ${username}, 邮箱: ${email}`);
        const user = await this.userEntity.findOne({ where: [{ username }, { email }] });
        if (user && user.username === username) {
            console.error(`校验失败: 用户名 "${username}" 已存在`);
            throw new common_1.HttpException('用户名已存在、请更换用户名！', common_1.HttpStatus.BAD_REQUEST);
        }
        if (user && user.email === email) {
            console.error(`校验失败: 邮箱 "${email}" 已被注册`);
            throw new common_1.HttpException('当前邮箱已注册、请勿重复注册！', common_1.HttpStatus.BAD_REQUEST);
        }
        console.log(`校验邮箱注册: 成功 - 用户名: ${username}, 邮箱: ${email} 未被占用`);
    }
    async createUser(userInfo) {
        return await this.userEntity.save(userInfo);
    }
};
UserService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, typeorm_1.InjectRepository)(user_entity_1.UserEntity)),
    __param(1, (0, typeorm_1.InjectRepository)(whiteList_entity_1.WhiteListEntity)),
    __param(7, (0, typeorm_1.InjectRepository)(config_entity_1.ConfigEntity)),
    __metadata("design:paramtypes", [typeorm_2.Repository,
        typeorm_2.Repository,
        typeorm_2.Connection,
        verification_service_1.VerificationService,
        mailer_service_1.MailerService,
        userBalance_service_1.UserBalanceService,
        globalConfig_service_1.GlobalConfigService,
        typeorm_2.Repository])
], UserService);
exports.UserService = UserService;
