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
exports.SalesService = void 0;
const globalConfig_service_1 = require("./../globalConfig/globalConfig.service");
const common_1 = require("@nestjs/common");
const salesUsers_entity_1 = require("./salesUsers.entity");
const typeorm_1 = require("@nestjs/typeorm");
const typeorm_2 = require("typeorm");
const salesRecords_entity_1 = require("./salesRecords.entity");
const utils_1 = require("../../common/utils");
const user_entity_1 = require("../user/user.entity");
const decimal_js_1 = require("decimal.js");
const salesOrder_entity_1 = require("./salesOrder.entity");
let SalesService = class SalesService {
    constructor(salesUsersEntity, salesRecordsEntity, userEntity, salesOrderEntity, globalConfigService) {
        this.salesUsersEntity = salesUsersEntity;
        this.salesRecordsEntity = salesRecordsEntity;
        this.userEntity = userEntity;
        this.salesOrderEntity = salesOrderEntity;
        this.globalConfigService = globalConfigService;
    }
    async getMineAccount(req) {
        try {
            const { id: userId } = req.user;
            let u = await this.salesUsersEntity.findOne({ where: { userId } });
            if (!u) {
                const { salesBaseRatio = 10, salesBaseTitle = '新秀分销商' } = await this.globalConfigService.getConfigs([
                    'salesBaseRatio',
                    'salesBaseTitle',
                ]);
                u = await this.creaetUserBaseSalesInfo({ userId, performanceRatio: Number(salesBaseRatio), salesOutletName: salesBaseTitle });
            }
            const account = (0, utils_1.formatCreateOrUpdateDate)(u);
            const orderCount = await this.salesRecordsEntity.count({ where: { inviterUserId: userId } });
            const userInfo = await this.userEntity.findOne({ where: { id: userId } }) || { inviteLinkCount: 0, inviteCode: 'xxxxxxx' };
            const { inviteLinkCount, inviteCode } = userInfo;
            const inviteCount = await this.userEntity.count({ where: { invitedBy: inviteCode } });
            return Object.assign(Object.assign({}, account), { orderCount,
                inviteCount,
                inviteLinkCount });
        }
        catch (error) {
            console.log('error: ', error);
        }
    }
    async getMineRecords(req, query) {
        try {
            const { id: inviterUserId } = req.user;
            const { page, size } = query;
            const [rows, count] = await this.salesRecordsEntity.findAndCount({
                where: { inviterUserId },
                order: { createdAt: 'DESC' },
                skip: (page - 1) * size,
                take: size,
            });
            return {
                rows: (0, utils_1.formatCreateOrUpdateDate)(rows),
                count,
            };
        }
        catch (error) {
            console.log('error: ', error);
        }
    }
    async inviteRecords(req, query) {
        try {
            const { page, size, orderId, orderPrice } = query;
            let where = {};
            orderId && (where = { orderId });
            orderPrice && (where = { orderPrice });
            const [rows, count] = await this.salesRecordsEntity.findAndCount({
                where,
                order: { createdAt: 'DESC' },
                skip: (page - 1) * size,
                take: size,
            });
            const userIds = [];
            rows.map((item) => {
                userIds.push(item.inviterUserId);
                userIds.push(item.inviteeUserId);
            });
            const userInfo = await this.userEntity.find({ where: { id: (0, typeorm_2.In)(userIds) } });
            rows.forEach((item) => {
                const inviterUser = userInfo.find((u) => u.id === item.inviterUserId);
                const inviteeUser = userInfo.find((u) => u.id === item.inviteeUserId);
                const { username, email, avatar } = userInfo.find((u) => u.id === item.inviterUserId);
                item.inviterUsername = inviterUser === null || inviterUser === void 0 ? void 0 : inviterUser.username;
                item.inviterEmail = inviterUser === null || inviterUser === void 0 ? void 0 : inviterUser.email;
                item.inviterAvatar = inviterUser === null || inviterUser === void 0 ? void 0 : inviterUser.avatar;
                item.inviteeUsername = inviteeUser === null || inviteeUser === void 0 ? void 0 : inviteeUser.username;
                item.inviteeEmail = inviteeUser === null || inviteeUser === void 0 ? void 0 : inviteeUser.email;
                item.inviteeAvatar = inviteeUser === null || inviteeUser === void 0 ? void 0 : inviteeUser.avatar;
            });
            if (req.user.role !== 'super') {
                rows.forEach((item) => {
                    item.inviterEmail = item.inviterEmail ? (0, utils_1.hideString)(item.inviterEmail) : '';
                    item.inviteeEmail = item.inviteeEmail ? (0, utils_1.hideString)(item.inviteeEmail) : '';
                });
            }
            return {
                rows: (0, utils_1.formatCreateOrUpdateDate)(rows),
                count,
            };
        }
        catch (error) {
            console.log('error: ', error);
        }
    }
    async creaetUserBaseSalesInfo(salesInfo) {
        const { userId, performanceRatio, salesOutletName } = salesInfo;
        return await this.salesUsersEntity.save({ userId, performanceRatio, salesOutletName });
    }
    async changeUserBaseSalesInfo(salesInfo) {
        return await this.salesUsersEntity.save(salesInfo);
    }
    async createSalesRecords(salesRecords) {
        return await this.salesRecordsEntity.save(salesRecords);
    }
    async saveCommissionAmount(userId, amount) {
        const inviteUserInfo = await this.salesUsersEntity.findOne({ where: { userId } });
        if (!inviteUserInfo)
            return;
        const { totalAmount, distributionBalance } = inviteUserInfo;
        console.log('totalAmount, distributionBalance: ', totalAmount, distributionBalance);
        return await this.salesUsersEntity.update({ userId }, {
            totalAmount: new decimal_js_1.default(totalAmount).plus(amount).toNumber(),
            distributionBalance: new decimal_js_1.default(distributionBalance).plus(amount).toNumber(),
        });
    }
    async appForMoney(req, body) {
        const { id: userId } = req.user;
        const { withdrawalAmount, withdrawalChannels, contactInformation, remark } = body;
        const salesAllowDrawMoney = (await this.globalConfigService.getConfigs(['salesAllowDrawMoney'])) || 10;
        if (typeof withdrawalAmount !== 'number' || withdrawalAmount <= 0) {
            throw new common_1.HttpException('提现金额必须为数字且大于0', common_1.HttpStatus.BAD_REQUEST);
        }
        if (Number(withdrawalAmount) < Number(salesAllowDrawMoney)) {
            throw new common_1.HttpException(`提现金额最低必须为${salesAllowDrawMoney}元`, common_1.HttpStatus.BAD_REQUEST);
        }
        const salesBalanceInfo = await this.salesUsersEntity.findOne({ where: { userId } });
        const { distributionBalance, drawMoneyIn } = salesBalanceInfo;
        if (Number(distributionBalance) < Number(withdrawalAmount)) {
            throw new common_1.HttpException('提现金额不足', common_1.HttpStatus.BAD_REQUEST);
        }
        const newDistributionBalance = new decimal_js_1.default(distributionBalance).minus(withdrawalAmount).toNumber();
        const orderInfo = { userId, withdrawalAmount, orderStatus: 0, auditStatus: 0, withdrawalChannels, contactInformation, remark };
        await this.createOrder(orderInfo);
        const res = await this.salesUsersEntity.update({ userId }, { distributionBalance: newDistributionBalance, drawMoneyIn: new decimal_js_1.default(drawMoneyIn).plus(withdrawalAmount).toNumber() });
    }
    async drawMoneyOrder(req, query) {
        const { id: userId } = req.user;
        const { page, size } = query;
        const [rows, count] = await this.salesOrderEntity.findAndCount({
            where: { userId },
            order: { createdAt: 'DESC' },
            skip: (page - 1) * size,
            take: size,
        });
        const auditUserIds = rows.map((item) => item.auditUserId);
        const userInfos = await this.userEntity.find({ where: { id: (0, typeorm_2.In)(auditUserIds) } });
        rows.forEach((item) => {
            const curUserInfo = userInfos.find((user) => user.id === item.auditUserId);
            item.auditUserName = curUserInfo ? curUserInfo.username : '';
        });
        return {
            rows: (0, utils_1.formatCreateOrUpdateDate)(rows),
            count,
        };
    }
    async salesOrder(req, query) {
        const { page, size } = query;
        const where = {};
        query.orderStatus !== undefined && query.orderStatus !== '' && (where.orderStatus = query.orderStatus);
        query.withdrawalChannels && (where.withdrawalChannels = query.withdrawalChannels);
        const [rows, count] = await this.salesOrderEntity.findAndCount({
            where,
            order: { createdAt: 'DESC' },
            skip: (page - 1) * size,
            take: size,
        });
        const userIds = rows.map((item) => item.userId);
        const userInfo = await this.userEntity.find({ where: { id: (0, typeorm_2.In)(userIds) } });
        rows.forEach((item) => {
            const curUser = userInfo.find((user) => user.id === item.userId);
            if (curUser) {
                const { username, email, avatar } = curUser;
                item.userInfo = { username, avatar, email: (0, utils_1.hideString)(email) };
            }
        });
        return {
            rows: (0, utils_1.formatCreateOrUpdateDate)(rows),
            count,
        };
    }
    async createOrder(orderInfo) {
        try {
            return await this.salesOrderEntity.save(orderInfo);
        }
        catch (error) {
            console.log('error: ', error);
            throw new common_1.HttpException('创建提现工单失败', common_1.HttpStatus.BAD_REQUEST);
        }
    }
    async auditOrder(req, body) {
        try {
            const { id: userId } = req.user;
            const { id, status } = body;
            if (![1, -1].includes(status)) {
                throw new common_1.HttpException('审核状态错误', common_1.HttpStatus.BAD_REQUEST);
            }
            const orderInfo = await this.salesOrderEntity.findOne({ where: { id } });
            if (orderInfo.orderStatus !== 0) {
                throw new common_1.HttpException('该工单已审核过', common_1.HttpStatus.BAD_REQUEST);
            }
            const userBalanceInfo = await this.salesUsersEntity.findOne({ where: { userId: orderInfo.userId } });
            const { withdrawalAmount, drawMoneyIn } = userBalanceInfo;
            const newWithdrawalAmount = new decimal_js_1.default(withdrawalAmount).plus(orderInfo.withdrawalAmount).toNumber();
            const newDrawMoneyIn = new decimal_js_1.default(drawMoneyIn).minus(orderInfo.withdrawalAmount).toNumber();
            await this.salesUsersEntity.update({ userId: orderInfo.userId }, { withdrawalAmount: newWithdrawalAmount, drawMoneyIn: newDrawMoneyIn });
            await this.salesOrderEntity.update({ id }, { orderStatus: status, auditStatus: status, auditUserId: userId, paymentStatus: status });
            return '审核完成';
        }
        catch (error) {
            console.log('error: ', error);
            throw new common_1.HttpException('审核失败', common_1.HttpStatus.BAD_REQUEST);
        }
    }
    async salesUserList(req, query) {
        const { page, size, salesOutletName, performanceRatio } = query;
        const where = {};
        salesOutletName && (where.salesOutletName = (0, typeorm_2.Like)(`%${salesOutletName}%`));
        performanceRatio && (where.performanceRatio = performanceRatio);
        const [rows, count] = await this.salesUsersEntity.findAndCount({
            where,
            order: { id: 'DESC' },
            skip: (page - 1) * size,
            take: size,
        });
        const userIds = rows.map((item) => item.userId);
        const userInfos = await this.userEntity.find({ where: { id: (0, typeorm_2.In)(userIds) } });
        rows.forEach((item) => {
            const curUserInfo = userInfos.find((user) => user.id === item.userId);
            item.userInfo = curUserInfo ? curUserInfo : {};
        });
        if (req.user.role !== 'super') {
            rows.forEach((item) => {
                var _a, _b;
                item.userInfo.email = ((_a = item.userInfo) === null || _a === void 0 ? void 0 : _a.email) ? (0, utils_1.hideString)((_b = item.userInfo) === null || _b === void 0 ? void 0 : _b.email) : '';
            });
        }
        return { rows, count };
    }
    async updateUserSales(req, body) {
        const { performanceRatio, salesOutletName, userId } = body;
        const salesU = await this.salesUsersEntity.findOne({ where: { userId } });
        if (!salesU) {
            throw new common_1.HttpException('用户不存在', common_1.HttpStatus.BAD_REQUEST);
        }
        const res = await this.salesUsersEntity.update({ userId }, { performanceRatio, salesOutletName });
        if (res.affected > 0) {
            return '修改成功';
        }
        else {
            throw new common_1.HttpException('修改失败', common_1.HttpStatus.BAD_REQUEST);
        }
    }
};
SalesService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, typeorm_1.InjectRepository)(salesUsers_entity_1.SalesUsersEntity)),
    __param(1, (0, typeorm_1.InjectRepository)(salesRecords_entity_1.SalesRecordsEntity)),
    __param(2, (0, typeorm_1.InjectRepository)(user_entity_1.UserEntity)),
    __param(3, (0, typeorm_1.InjectRepository)(salesOrder_entity_1.SalesOrderEntity)),
    __metadata("design:paramtypes", [typeorm_2.Repository,
        typeorm_2.Repository,
        typeorm_2.Repository,
        typeorm_2.Repository,
        globalConfig_service_1.GlobalConfigService])
], SalesService);
exports.SalesService = SalesService;
