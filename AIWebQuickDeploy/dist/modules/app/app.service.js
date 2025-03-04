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
exports.AppService = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("@nestjs/typeorm");
const typeorm_2 = require("typeorm");
const app_entity_1 = require("./app.entity");
const appCats_entity_1 = require("./appCats.entity");
const userApps_entity_1 = require("./userApps.entity");
let AppService = class AppService {
    constructor(appCatsEntity, appEntity, userAppsEntity) {
        this.appCatsEntity = appCatsEntity;
        this.appEntity = appEntity;
        this.userAppsEntity = userAppsEntity;
    }
    async createAppCat(body) {
        const { name } = body;
        const c = await this.appCatsEntity.findOne({ where: { name } });
        if (c) {
            throw new common_1.HttpException('该分类名称已存在！', common_1.HttpStatus.BAD_REQUEST);
        }
        return await this.appCatsEntity.save(body);
    }
    async delAppCat(body) {
        const { id } = body;
        const c = await this.appCatsEntity.findOne({ where: { id } });
        if (!c) {
            throw new common_1.HttpException('该分类不存在！', common_1.HttpStatus.BAD_REQUEST);
        }
        const count = await this.appEntity.count({ where: { catId: id } });
        if (count > 0) {
            throw new common_1.HttpException('该分类下存在App，不可删除！', common_1.HttpStatus.BAD_REQUEST);
        }
        const res = await this.appCatsEntity.delete(id);
        if (res.affected > 0)
            return '删除成功';
        throw new common_1.HttpException('删除失败！', common_1.HttpStatus.BAD_REQUEST);
    }
    async updateAppCats(body) {
        const { id, name } = body;
        const c = await this.appCatsEntity.findOne({
            where: { name, id: (0, typeorm_2.Not)(id) },
        });
        if (c) {
            throw new common_1.HttpException('该分类名称已存在！', common_1.HttpStatus.BAD_REQUEST);
        }
        const res = await this.appCatsEntity.update({ id }, body);
        if (res.affected > 0)
            return '修改成功';
        throw new common_1.HttpException('修改失败！', common_1.HttpStatus.BAD_REQUEST);
    }
    async queryOneCat(params) {
        const { id } = params;
        if (!id) {
            throw new common_1.HttpException('缺失必要参数！', common_1.HttpStatus.BAD_REQUEST);
        }
        const app = await this.appEntity.findOne({ where: { id } });
        const { demoData: demo, coverImg, des, name, isFixedModel, isGPTs, appModel, } = app;
        return {
            demoData: demo ? demo.split('\n') : [],
            coverImg,
            des,
            name,
            isGPTs,
            isFixedModel,
            appModel,
        };
    }
    async appCatsList(query) {
        const { page = 1, size = 10, name, status } = query;
        const where = {};
        name && (where.name = (0, typeorm_2.Like)(`%${name}%`));
        [0, 1, '0', '1'].includes(status) && (where.status = status);
        const [rows, count] = await this.appCatsEntity.findAndCount({
            where,
            order: { order: 'DESC' },
            skip: (page - 1) * size,
            take: size,
        });
        const catIds = rows.map((item) => item.id);
        const apps = await this.appEntity.find({ where: { catId: (0, typeorm_2.In)(catIds) } });
        const appCountMap = {};
        apps.forEach((item) => {
            if (appCountMap[item.catId]) {
                appCountMap[item.catId] += 1;
            }
            else {
                appCountMap[item.catId] = 1;
            }
        });
        rows.forEach((item) => (item.appCount = appCountMap[item.id] || 0));
        return { rows, count };
    }
    async appList(req, query, orderKey = 'id') {
        var _a;
        const { page = 1, size = 10, name, status, catId, role } = query;
        const where = { isSystemReserved: 0 };
        name && (where.name = (0, typeorm_2.Like)(`%${name}%`));
        catId && (where.catId = catId);
        role && (where.role = role);
        status && (where.status = status);
        const [rows, count] = await this.appEntity.findAndCount({
            where,
            order: { [orderKey]: 'DESC' },
            skip: (page - 1) * size,
            take: size,
        });
        const catIds = rows.map((item) => item.catId);
        const cats = await this.appCatsEntity.find({ where: { id: (0, typeorm_2.In)(catIds) } });
        rows.forEach((item) => {
            const cat = cats.find((c) => c.id === item.catId);
            item.catName = cat ? cat.name : '';
        });
        if (((_a = req === null || req === void 0 ? void 0 : req.user) === null || _a === void 0 ? void 0 : _a.role) !== 'super') {
            rows.forEach((item) => {
                delete item.preset;
            });
        }
        return { rows, count };
    }
    async frontAppList(req, query, orderKey = 'id') {
        var _a;
        const { page = 1, size = 1000, name, catId, role } = query;
        const where = [
            {
                status: (0, typeorm_2.In)([1, 4]),
                userId: (0, typeorm_2.IsNull)(),
                public: false,
                isSystemReserved: 0,
            },
            { userId: (0, typeorm_2.MoreThan)(0), public: true },
        ];
        const [rows, count] = await this.appEntity.findAndCount({
            where,
            order: { order: 'DESC' },
            skip: (page - 1) * size,
            take: size,
        });
        const catIds = rows.map((item) => item.catId);
        const cats = await this.appCatsEntity.find({ where: { id: (0, typeorm_2.In)(catIds) } });
        rows.forEach((item) => {
            const cat = cats.find((c) => c.id === item.catId);
            item.catName = cat ? cat.name : '';
        });
        if (((_a = req === null || req === void 0 ? void 0 : req.user) === null || _a === void 0 ? void 0 : _a.role) !== 'super') {
            rows.forEach((item) => {
                delete item.preset;
            });
        }
        return { rows, count };
    }
    async searchAppList(body) {
        console.log('搜索App列表', body);
        const { page = 1, size = 1000, keyword } = body;
        console.log(`搜索关键词：${keyword}`);
        let baseWhere = [
            {
                status: (0, typeorm_2.In)([1, 4]),
                userId: (0, typeorm_2.IsNull)(),
                public: false,
                isSystemReserved: 0,
            },
            { userId: (0, typeorm_2.MoreThan)(0), public: true },
        ];
        console.log('初始查询条件：', JSON.stringify(baseWhere));
        if (keyword) {
            baseWhere = baseWhere.map((condition) => (Object.assign(Object.assign({}, condition), { name: (0, typeorm_2.Like)(`%${keyword}%`) })));
            console.log('更新后的查询条件：', JSON.stringify(baseWhere));
        }
        try {
            const [rows, count] = await this.appEntity.findAndCount({
                where: baseWhere,
                skip: (page - 1) * size,
                take: size,
            });
            console.log(`查询返回 ${count} 条结果，显示第 ${page} 页的结果。`);
            rows.forEach((item) => {
                delete item.preset;
            });
            console.log('完成查询，准备返回结果');
            return { rows, count };
        }
        catch (error) {
            console.error('查询数据库时出错：', error);
            throw new Error('Database query failed');
        }
    }
    async createApp(body) {
        const { name, catId } = body;
        body.role = 'system';
        const a = await this.appEntity.findOne({ where: { name } });
        if (a) {
            throw new common_1.HttpException('该应用名称已存在！', common_1.HttpStatus.BAD_REQUEST);
        }
        const c = await this.appCatsEntity.findOne({ where: { id: catId } });
        if (!c) {
            throw new common_1.HttpException('该分类不存在！', common_1.HttpStatus.BAD_REQUEST);
        }
        return await this.appEntity.save(body);
    }
    async updateApp(body) {
        const { id, name, catId, status } = body;
        const a = await this.appEntity.findOne({ where: { name, id: (0, typeorm_2.Not)(id) } });
        if (a) {
            throw new common_1.HttpException('该应用名称已存在！', common_1.HttpStatus.BAD_REQUEST);
        }
        const c = await this.appCatsEntity.findOne({ where: { id: catId } });
        if (!c) {
            throw new common_1.HttpException('该分类不存在！', common_1.HttpStatus.BAD_REQUEST);
        }
        const curApp = await this.appEntity.findOne({ where: { id } });
        if (curApp.status !== body.status) {
            await this.userAppsEntity.update({ appId: id }, { status });
        }
        const res = await this.appEntity.update({ id }, body);
        if (res.affected > 0)
            return '修改App信息成功';
        throw new common_1.HttpException('修改App信息失败！', common_1.HttpStatus.BAD_REQUEST);
    }
    async delApp(body) {
        const { id } = body;
        const a = await this.appEntity.findOne({ where: { id } });
        if (!a) {
            throw new common_1.HttpException('该应用不存在！', common_1.HttpStatus.BAD_REQUEST);
        }
        const useApp = await this.userAppsEntity.count({ where: { appId: id } });
        const res = await this.appEntity.delete(id);
        if (res.affected > 0)
            return '删除App成功';
        throw new common_1.HttpException('删除App失败！', common_1.HttpStatus.BAD_REQUEST);
    }
    async auditPass(body) {
        const { id } = body;
        const a = await this.appEntity.findOne({ where: { id, status: 3 } });
        if (!a) {
            throw new common_1.HttpException('该应用不存在！', common_1.HttpStatus.BAD_REQUEST);
        }
        await this.appEntity.update({ id }, { status: 4 });
        await this.userAppsEntity.update({ appId: id }, { status: 4 });
        return '应用审核通过';
    }
    async auditFail(body) {
        const { id } = body;
        const a = await this.appEntity.findOne({ where: { id, status: 3 } });
        if (!a) {
            throw new common_1.HttpException('该应用不存在！', common_1.HttpStatus.BAD_REQUEST);
        }
        await this.appEntity.update({ id }, { status: 5 });
        await this.userAppsEntity.update({ appId: id }, { status: 5 });
        return '应用审核拒绝完成';
    }
    async collect(body, req) {
        const { appId } = body;
        const { id: userId } = req.user;
        const historyApp = await this.userAppsEntity.findOne({
            where: { appId, userId },
        });
        if (historyApp) {
            const r = await this.userAppsEntity.delete({ appId, userId });
            if (r.affected > 0) {
                return '取消收藏成功!';
            }
            else {
                throw new common_1.HttpException('取消收藏失败！', common_1.HttpStatus.BAD_REQUEST);
            }
        }
        const app = await this.appEntity.findOne({ where: { id: appId } });
        const { id, role: appRole, catId } = app;
        const collectInfo = {
            userId,
            appId: id,
            catId,
            appRole,
            public: true,
            status: 1,
        };
        await this.userAppsEntity.save(collectInfo);
        return '已将应用加入到我的收藏！';
    }
    async mineApps(req, query = { page: 1, size: 30 }) {
        const { id } = req.user;
        const { page = 1, size = 30 } = query;
        let rows, count;
        try {
            [rows, count] = await this.userAppsEntity.findAndCount({
                where: { userId: id, status: (0, typeorm_2.In)([1, 3, 4, 5]) },
                order: { id: 'DESC' },
                skip: (page - 1) * size,
                take: size,
            });
            const appIds = rows.map((item) => item.appId);
            const appsInfo = await this.appEntity.find({ where: { id: (0, typeorm_2.In)(appIds) } });
            rows.forEach((item) => {
                const app = appsInfo.find((c) => c.id === item.appId);
                item.appName = app ? app.name : '未知';
                item.appRole = app ? app.role : '未知';
                item.appDes = app ? app.des : '未知';
                item.coverImg = app ? app.coverImg : '未知';
                item.demoData = app ? app.demoData : '未知';
                item.preset = app.userId === id ? app.preset : '******';
            });
        }
        catch (error) {
            console.error(`处理用户ID: ${id} 的mineApps请求时发生错误`, error);
            throw error;
        }
        return { rows, count };
    }
};
AppService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, typeorm_1.InjectRepository)(appCats_entity_1.AppCatsEntity)),
    __param(1, (0, typeorm_1.InjectRepository)(app_entity_1.AppEntity)),
    __param(2, (0, typeorm_1.InjectRepository)(userApps_entity_1.UserAppsEntity)),
    __metadata("design:paramtypes", [typeorm_2.Repository,
        typeorm_2.Repository,
        typeorm_2.Repository])
], AppService);
exports.AppService = AppService;
