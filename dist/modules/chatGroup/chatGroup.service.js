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
exports.ChatGroupService = void 0;
const common_1 = require("@nestjs/common");
const chatGroup_entity_1 = require("./chatGroup.entity");
const typeorm_1 = require("@nestjs/typeorm");
const typeorm_2 = require("typeorm");
const app_entity_1 = require("../app/app.entity");
const models_service_1 = require("../models/models.service");
let ChatGroupService = class ChatGroupService {
    constructor(chatGroupEntity, appEntity, modelsService) {
        this.chatGroupEntity = chatGroupEntity;
        this.appEntity = appEntity;
        this.modelsService = modelsService;
    }
    async create(body, req) {
        const { id } = req.user;
        const { appId } = body;
        const params = { title: '新对话', userId: id };
        if (appId) {
            const appInfo = await this.appEntity.findOne({ where: { id: appId } });
            if (!appInfo) {
                throw new common_1.HttpException('非法操作、您在使用一个不存在的应用！', common_1.HttpStatus.BAD_REQUEST);
            }
            else {
                const { status, name } = appInfo;
                const g = await this.chatGroupEntity.count({ where: { userId: id, appId, isDelete: false } });
                if (g > 0) {
                    throw new common_1.HttpException('当前应用已经开启了一个对话无需新建了！', common_1.HttpStatus.BAD_REQUEST);
                }
                if (![1, 3, 4, 5].includes(status)) {
                    throw new common_1.HttpException('非法操作、您在使用一个未启用的应用！', common_1.HttpStatus.BAD_REQUEST);
                }
                name && (params['title'] = name);
                appId && (params['appId'] = appId);
            }
        }
        const modelConfig = await this.modelsService.getBaseConfig(appId);
        appId && (modelConfig.appId = appId);
        if (!modelConfig) {
            throw new common_1.HttpException('管理员未配置任何AI模型、请先联系管理员开通聊天模型配置！', common_1.HttpStatus.BAD_REQUEST);
        }
        return await this.chatGroupEntity.save(Object.assign(Object.assign({}, params), { config: JSON.stringify(modelConfig) }));
    }
    async query(req) {
        try {
            const { id } = req.user;
            const params = { userId: id, isDelete: false };
            const res = await this.chatGroupEntity.find({ where: params, order: { isSticky: 'DESC', id: 'DESC' } });
            const appIds = res.filter(t => t.appId).map(t => t.appId);
            const appInfos = await this.appEntity.find({ where: { id: (0, typeorm_2.In)(appIds) } });
            return res.map((item) => {
                var _a;
                item.appLogo = (_a = appInfos.find(t => t.id === item.appId)) === null || _a === void 0 ? void 0 : _a.coverImg;
                return item;
            });
        }
        catch (error) {
            console.log('error: ', error);
        }
    }
    async update(body, req) {
        const { title, isSticky, groupId, config } = body;
        const { id } = req.user;
        const g = await this.chatGroupEntity.findOne({ where: { id: groupId, userId: id } });
        if (!g) {
            throw new common_1.HttpException('请先选择一个对话或者新加一个对话再操作！', common_1.HttpStatus.BAD_REQUEST);
        }
        const { appId } = g;
        if (appId && !title) {
            try {
                const parseData = JSON.parse(config);
                if (Number(parseData.keyType) !== 1) {
                    throw new common_1.HttpException('应用对话名称不能修改哟！', common_1.HttpStatus.BAD_REQUEST);
                }
            }
            catch (error) {
            }
        }
        const data = {};
        title && (data['title'] = title);
        typeof isSticky !== 'undefined' && (data['isSticky'] = isSticky);
        config && (data['config'] = config);
        const u = await this.chatGroupEntity.update({ id: groupId }, data);
        if (u.affected) {
            return true;
        }
        else {
            throw new common_1.HttpException('更新对话失败！', common_1.HttpStatus.BAD_REQUEST);
        }
    }
    async del(body, req) {
        const { groupId } = body;
        const { id } = req.user;
        const g = await this.chatGroupEntity.findOne({ where: { id: groupId, userId: id } });
        if (!g) {
            throw new common_1.HttpException('非法操作、您在删除一个非法资源！', common_1.HttpStatus.BAD_REQUEST);
        }
        const r = await this.chatGroupEntity.update({ id: groupId }, { isDelete: true });
        if (r.affected) {
            return '删除成功';
        }
        else {
            throw new common_1.HttpException('删除失败！', common_1.HttpStatus.BAD_REQUEST);
        }
    }
    async delAll(req) {
        const { id } = req.user;
        const r = await this.chatGroupEntity.update({ userId: id, isSticky: false, isDelete: false }, { isDelete: true });
        if (r.affected) {
            return '删除成功';
        }
        else {
            throw new common_1.HttpException('删除失败！', common_1.HttpStatus.BAD_REQUEST);
        }
    }
    async getGroupInfoFromId(id) {
        if (!id)
            return;
        return await this.chatGroupEntity.findOne({ where: { id } });
    }
};
ChatGroupService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, typeorm_1.InjectRepository)(chatGroup_entity_1.ChatGroupEntity)),
    __param(1, (0, typeorm_1.InjectRepository)(app_entity_1.AppEntity)),
    __metadata("design:paramtypes", [typeorm_2.Repository,
        typeorm_2.Repository,
        models_service_1.ModelsService])
], ChatGroupService);
exports.ChatGroupService = ChatGroupService;
