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
exports.CramiService = void 0;
const common_1 = require("@nestjs/common");
const crami_entity_1 = require("./crami.entity");
const typeorm_1 = require("@nestjs/typeorm");
const typeorm_2 = require("typeorm");
const cramiPackage_entity_1 = require("./cramiPackage.entity");
const utils_1 = require("../../common/utils");
const user_entity_1 = require("../user/user.entity");
const userBalance_service_1 = require("../userBalance/userBalance.service");
const balance_constant_1 = require("../../common/constants/balance.constant");
let CramiService = class CramiService {
    constructor(cramiEntity, cramiPackageEntity, userEntity, userBalanceService) {
        this.cramiEntity = cramiEntity;
        this.cramiPackageEntity = cramiPackageEntity;
        this.userEntity = userEntity;
        this.userBalanceService = userBalanceService;
    }
    async queryOnePackage(id) {
        return await this.cramiPackageEntity.findOne({ where: { id } });
    }
    async queryAllPackage(query) {
        try {
            const { page = 1, size = 10, name, status, type } = query;
            const where = {};
            name && Object.assign(where, { name: (0, typeorm_2.Like)(`%${name}%`) });
            status && Object.assign(where, { status });
            if (type) {
                if (type > 0) {
                    Object.assign(where, { days: (0, typeorm_2.MoreThan)(0) });
                }
                else {
                    Object.assign(where, { days: (0, typeorm_2.LessThanOrEqual)(0) });
                }
            }
            const [rows, count] = await this.cramiPackageEntity.findAndCount({
                skip: (page - 1) * size,
                take: size,
                where,
                order: { order: 'DESC' },
            });
            return { rows, count };
        }
        catch (error) {
            console.log('error: ', error);
        }
    }
    async createPackage(body) {
        const { name, weight } = body;
        const p = await this.cramiPackageEntity.findOne({ where: [{ name }, { weight }] });
        if (p) {
            throw new common_1.HttpException('套餐名称或套餐等级重复、请检查！', common_1.HttpStatus.BAD_REQUEST);
        }
        try {
            return await this.cramiPackageEntity.save(body);
        }
        catch (error) {
            console.log('error: ', error);
            throw new common_1.HttpException(error, common_1.HttpStatus.BAD_REQUEST);
        }
    }
    async updatePackage(body) {
        const { id, name, weight } = body;
        const op = await this.cramiPackageEntity.findOne({ where: { id } });
        if (!op) {
            throw new common_1.HttpException('当前套餐不存在、请检查你的输入参数！', common_1.HttpStatus.BAD_REQUEST);
        }
        const count = await this.cramiPackageEntity.count({
            where: [
                { name, id: (0, typeorm_2.Not)(id) },
                { weight, id: (0, typeorm_2.Not)(id) },
            ],
        });
        if (count) {
            throw new common_1.HttpException('套餐名称或套餐等级重复、请检查！', common_1.HttpStatus.BAD_REQUEST);
        }
        const res = await this.cramiPackageEntity.update({ id }, body);
        if (res.affected > 0) {
            return '更新套餐成功！';
        }
        else {
            throw new common_1.HttpException('更新套餐失败、请重试！', common_1.HttpStatus.BAD_REQUEST);
        }
    }
    async delPackage(body) {
        const { id } = body;
        const count = await this.cramiEntity.count({ where: { packageId: id } });
        if (count) {
            throw new common_1.HttpException('当前套餐下存在卡密、请先删除卡密后才可删除套餐！', common_1.HttpStatus.BAD_REQUEST);
        }
        return await this.cramiPackageEntity.delete({ id });
    }
    async createCrami(body) {
        const { packageId, count = 1 } = body;
        if (packageId) {
            const pkg = await this.cramiPackageEntity.findOne({ where: { id: packageId } });
            if (!pkg) {
                throw new common_1.HttpException('当前套餐不存在、请确认您选择的套餐是否存在！', common_1.HttpStatus.BAD_REQUEST);
            }
            const { days = -1, model3Count = 0, model4Count = 0, drawMjCount = 0 } = pkg;
            const baseCrami = { packageId, days, model3Count, model4Count, drawMjCount };
            return await this.generateCrami(baseCrami, count);
        }
        if (!packageId) {
            const { model3Count = 0, model4Count = 0, drawMjCount = 0 } = body;
            if ([model3Count, model4Count, drawMjCount].every((v) => !v)) {
                throw new common_1.HttpException('自定义卡密必须至少一项余额不为0️零！', common_1.HttpStatus.BAD_REQUEST);
            }
            const baseCrami = { days: -1, model3Count, model4Count, drawMjCount };
            return await this.generateCrami(baseCrami, count);
        }
    }
    async generateCrami(cramiInfo, count) {
        const cramiList = [];
        for (let i = 0; i < count; i++) {
            const code = (0, utils_1.generateCramiCode)();
            const crami = this.cramiEntity.create(Object.assign(Object.assign({}, cramiInfo), { code }));
            cramiList.push(crami);
        }
        return await this.cramiEntity.save(cramiList);
    }
    async useCrami(req, body) {
        const { id } = req.user;
        const crami = await this.cramiEntity.findOne({ where: { code: body.code } });
        if (!crami) {
            throw new common_1.HttpException('当前卡密不存在、请确认您输入的卡密是否正确！', common_1.HttpStatus.BAD_REQUEST);
        }
        const { status, days = -1, model3Count = 0, model4Count = 0, drawMjCount = 0, packageId } = crami;
        if (status === 1) {
            throw new common_1.HttpException('当前卡密已被使用、请确认您输入的卡密是否正确！', common_1.HttpStatus.BAD_REQUEST);
        }
        const balanceInfo = { model3Count, model4Count, drawMjCount, packageId };
        await this.userBalanceService.addBalanceToUser(id, Object.assign({}, balanceInfo), days);
        await this.userBalanceService.saveRecordRechargeLog({
            userId: id,
            rechargeType: balance_constant_1.RechargeType.PACKAGE_GIFT,
            model3Count,
            model4Count,
            drawMjCount,
            days,
        });
        await this.cramiEntity.update({ code: body.code }, { useId: id, status: 1 });
        return '使用卡密成功';
    }
    async queryAllCrami(params, req) {
        const { page = 1, size = 10, status, useId } = params;
        const where = {};
        status && Object.assign(where, { status });
        useId && Object.assign(where, { useId });
        const [rows, count] = await this.cramiEntity.findAndCount({
            skip: (page - 1) * size,
            take: size,
            order: { createdAt: 'DESC' },
            where,
        });
        const userIds = rows.map((t) => t.useId);
        const packageIds = rows.map((t) => t.packageId);
        const userInfos = await this.userEntity.find({ where: { id: (0, typeorm_2.In)(userIds) } });
        const packageInfos = await this.cramiPackageEntity.find({ where: { id: (0, typeorm_2.In)(packageIds) } });
        rows.forEach((t) => {
            var _a, _b, _c;
            t.username = (_a = userInfos.find((u) => u.id === t.useId)) === null || _a === void 0 ? void 0 : _a.username;
            t.email = (_b = userInfos.find((u) => u.id === t.useId)) === null || _b === void 0 ? void 0 : _b.email;
            t.packageName = (_c = packageInfos.find((p) => p.id === t.packageId)) === null || _c === void 0 ? void 0 : _c.name;
        });
        req.user.role !== 'super' && rows.forEach((t) => (t.email = (0, utils_1.maskEmail)(t.email)));
        req.user.role !== 'super' && rows.forEach((t) => (t.code = (0, utils_1.maskCrami)(t.code)));
        return { rows, count };
    }
    async delCrami(id) {
        const c = await this.cramiEntity.findOne({ where: { id } });
        if (!c) {
            throw new common_1.HttpException('当前卡密不存在、请确认您要删除的卡密是否存在！', common_1.HttpStatus.BAD_REQUEST);
        }
        if (c.status === 1) {
            throw new common_1.HttpException('当前卡密已被使用、已使用的卡密禁止删除！', common_1.HttpStatus.BAD_REQUEST);
        }
        return await this.cramiEntity.delete({ id });
    }
    async batchDelCrami(body) {
        const { ids } = body;
        const res = await this.cramiEntity.delete(ids);
        if (res.affected > 0) {
            return '删除卡密成功！';
        }
        else {
            throw new common_1.HttpException('删除卡密失败、请重试！', common_1.HttpStatus.BAD_REQUEST);
        }
    }
};
CramiService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, typeorm_1.InjectRepository)(crami_entity_1.CramiEntity)),
    __param(1, (0, typeorm_1.InjectRepository)(cramiPackage_entity_1.CramiPackageEntity)),
    __param(2, (0, typeorm_1.InjectRepository)(user_entity_1.UserEntity)),
    __metadata("design:paramtypes", [typeorm_2.Repository,
        typeorm_2.Repository,
        typeorm_2.Repository,
        userBalance_service_1.UserBalanceService])
], CramiService);
exports.CramiService = CramiService;
