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
exports.ChatLogService = void 0;
const balance_constant_1 = require("../../common/constants/balance.constant");
const utils_1 = require("../../common/utils");
const common_1 = require("@nestjs/common");
const typeorm_1 = require("@nestjs/typeorm");
const exceljs_1 = require("exceljs");
const typeorm_2 = require("typeorm");
const chatGroup_entity_1 = require("../chatGroup/chatGroup.entity");
const user_entity_1 = require("../user/user.entity");
const chatLog_entity_1 = require("./chatLog.entity");
const models_service_1 = require("../models/models.service");
let ChatLogService = class ChatLogService {
    constructor(chatLogEntity, userEntity, chatGroupEntity, modelsService) {
        this.chatLogEntity = chatLogEntity;
        this.userEntity = userEntity;
        this.chatGroupEntity = chatGroupEntity;
        this.modelsService = modelsService;
    }
    async saveChatLog(logInfo) {
        const savedLog = await this.chatLogEntity.save(logInfo);
        return savedLog;
    }
    async updateChatLog(id, logInfo) {
        return await this.chatLogEntity.update({ id }, logInfo);
    }
    async findOneChatLog(id) {
        return await this.chatLogEntity.findOne({ where: { id } });
    }
    async querDrawLog(req, query) {
        const { id } = req.user;
        const { model } = query;
        const where = { userId: id, type: balance_constant_1.ChatType.PAINT };
        if (model) {
            where.model = model;
            if (model === 'DALL-E2') {
                where.model = (0, typeorm_2.In)(['DALL-E2', 'dall-e-3']);
            }
        }
        const data = await this.chatLogEntity.find({
            where,
            order: { id: 'DESC' },
            select: ['id', 'answer', 'prompt', 'model', 'type', 'fileInfo'],
        });
        data.forEach((r) => {
            if (r.type === 'paintCount') {
                const w = r.model === 'mj' ? 310 : 160;
                const imgType = r.answer.includes('cos') ? 'tencent' : 'ali';
                const compress = imgType === 'tencent'
                    ? `?imageView2/1/w/${w}/q/55`
                    : `?x-oss-process=image/resize,w_${w}`;
                r.thumbImg = r.answer + compress;
                try {
                    r.fileInfo = r.fileInfo ? JSON.parse(r.fileInfo) : null;
                }
                catch (error) {
                    r.fileInfo = {};
                }
            }
        });
        return data;
    }
    async querAllDrawLog(params) {
        const { page = 1, size = 20, rec, userId, model } = params;
        const where = {
            type: 2,
            prompt: (0, typeorm_2.Not)(''),
            answer: (0, typeorm_2.Not)(''),
            fileInfo: (0, typeorm_2.Not)(''),
        };
        rec && Object.assign(where, { rec });
        userId && Object.assign(where, { userId });
        if (model) {
            where.model = model;
        }
        else {
            where.model = (0, typeorm_2.In)(['midjourney', 'dall-e-3', 'stable-diffusion']);
        }
        const [rows, count] = await this.chatLogEntity.findAndCount({
            order: { id: 'DESC' },
            skip: (page - 1) * size,
            take: size,
            where,
        });
        const userIds = rows
            .map((item) => item.userId)
            .filter((id) => id < 100000);
        const userInfos = await this.userEntity.find({
            where: { id: (0, typeorm_2.In)(userIds) },
            select: ['id', 'username', 'avatar', 'email'],
        });
        rows.forEach((item) => {
            item.userInfo = userInfos.find((user) => user.id === item.userId);
        });
        rows.forEach((r) => {
            var _a;
            const w = r.model === 'midjourney' ? 310 : 160;
            const imgType = r.answer.includes('cos') ? 'tencent' : 'ali';
            const compress = imgType === 'tencent'
                ? `?imageView2/1/w/${w}/q/55`
                : `?x-oss-process=image/resize,w_${w}`;
            r.thumbImg = r.answer + compress;
            try {
                const detailInfo = r.extend ? JSON.parse(r.extend) : null;
                if (detailInfo) {
                    if (detailInfo) {
                        r.isGroup = ((_a = detailInfo === null || detailInfo === void 0 ? void 0 : detailInfo.components[0]) === null || _a === void 0 ? void 0 : _a.components.length) === 5;
                    }
                    else {
                        r.isGroup = false;
                    }
                }
            }
            catch (error) {
                console.log('querAllDrawLog Json parse error', error);
            }
        });
        return { rows, count };
    }
    async findOneDrawLog(params) {
        const { id } = params;
        const record = await this.chatLogEntity.findOne({ where: { id } });
        return record;
    }
    async recDrawImg(body) {
        const { id } = body;
        const l = await this.chatLogEntity.findOne({
            where: { id, type: balance_constant_1.ChatType.PAINT },
        });
        if (!l) {
            throw new common_1.HttpException('你推荐的图片不存在、请检查！', common_1.HttpStatus.BAD_REQUEST);
        }
        const rec = l.rec === 1 ? 0 : 1;
        const res = await this.chatLogEntity.update({ id }, { rec });
        if (res.affected > 0) {
            return `${rec ? '推荐' : '取消推荐'}图片成功！`;
        }
        throw new common_1.HttpException('你操作的图片不存在、请检查！', common_1.HttpStatus.BAD_REQUEST);
    }
    async exportExcel(body, res) {
        const where = { type: balance_constant_1.ChatType.NORMAL_CHAT };
        const { page = 1, size = 30, prompt, email } = body;
        prompt && Object.assign(where, { prompt: (0, typeorm_2.Like)(`%${prompt}%`) });
        if (email) {
            const user = await this.userEntity.findOne({ where: { email } });
            (user === null || user === void 0 ? void 0 : user.id) && Object.assign(where, { userId: user.id });
        }
        const [rows, count] = await this.chatLogEntity.findAndCount({
            order: { id: 'DESC' },
            skip: (page - 1) * size,
            take: size,
            where,
        });
        const userIds = rows.map((r) => r.userId);
        const userInfos = await this.userEntity.find({
            where: { id: (0, typeorm_2.In)(userIds) },
        });
        const data = rows.map((r) => {
            const userInfo = userInfos.find((u) => u.id === r.userId);
            return {
                username: userInfo ? userInfo.username : '',
                email: userInfo ? userInfo.email : '',
                prompt: r.prompt,
                answer: r.answer,
                createdAt: (0, utils_1.formatDate)(r.createdAt),
            };
        });
        const workbook = new exceljs_1.default.Workbook();
        const worksheet = workbook.addWorksheet('chatlog');
        worksheet.columns = [
            { header: '用户名', key: 'username', width: 20 },
            { header: '用户邮箱', key: 'email', width: 20 },
            { header: '提问时间', key: 'createdAt', width: 20 },
            { header: '提问问题', key: 'prompt', width: 80 },
            { header: '回答答案', key: 'answer', width: 150 },
        ];
        data.forEach((row) => worksheet.addRow(row));
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', 'attachment; filename=' + 'chat.xlsx');
        await workbook.xlsx.write(res);
        res.end();
    }
    async querAllChatLog(params, req) {
        const { page = 1, size = 20, userId, prompt } = params;
        const where = { type: balance_constant_1.ChatType.NORMAL_CHAT, prompt: (0, typeorm_2.Not)('') };
        userId && Object.assign(where, { userId });
        prompt && Object.assign(where, { prompt: (0, typeorm_2.Like)(`%${prompt}%`) });
        const [rows, count] = await this.chatLogEntity.findAndCount({
            order: { id: 'DESC' },
            skip: (page - 1) * size,
            take: size,
            where,
        });
        const userIds = rows.map((item) => item.userId);
        const userInfo = await this.userEntity.find({
            where: { id: (0, typeorm_2.In)(userIds) },
            select: ['id', 'username', 'email'],
        });
        rows.forEach((item) => {
            const { username, email } = userInfo.find((u) => u.id === item.userId) || {};
            item.username = username;
            item.email = email;
        });
        req.user.role !== 'super' &&
            rows.forEach((t) => (t.email = (0, utils_1.maskEmail)(t.email)));
        rows.forEach((item) => {
            !item.email && (item.email = `${item === null || item === void 0 ? void 0 : item.userId}@aiweb.com`);
            !item.username && (item.username = `游客${item === null || item === void 0 ? void 0 : item.userId}`);
        });
        return { rows, count };
    }
    async chatList(req, params) {
        const { id } = req.user;
        const { groupId } = params;
        const where = { userId: id, isDelete: false };
        groupId && Object.assign(where, { groupId });
        if (groupId) {
            const count = await this.chatGroupEntity.count({
                where: { isDelete: false },
            });
            if (count === 0)
                return [];
        }
        const list = await this.chatLogEntity.find({ where });
        return list.map((item) => {
            const { prompt, role, answer, createdAt, model, modelName, type, status, action, drawId, id, fileInfo, ttsUrl, videoUrl, audioUrl, customId, pluginParam, modelAvatar, taskData, promptReference, } = item;
            return {
                chatId: id,
                dateTime: (0, utils_1.formatDate)(createdAt),
                text: role === 'user' ? prompt : answer,
                modelType: type,
                status: status,
                action: action,
                drawId: drawId,
                customId: customId,
                inversion: role === 'user',
                error: false,
                fileInfo: fileInfo,
                ttsUrl: ttsUrl,
                videoUrl: videoUrl,
                audioUrl: audioUrl,
                model: model,
                modelName: modelName,
                pluginParam: pluginParam,
                modelAvatar: modelAvatar,
                taskData: taskData,
                promptReference: promptReference,
            };
        });
    }
    async chatHistory(groupId, rounds) {
        if (rounds === 0) {
            return [];
        }
        const where = { isDelete: false, groupId: groupId };
        const list = await this.chatLogEntity.find({
            where,
            order: {
                createdAt: 'DESC',
            },
            take: rounds * 2,
        });
        const result = list
            .map((item) => {
            const { role, prompt, answer, fileInfo } = item;
            const record = {
                role: role,
                text: role === 'user' ? prompt : answer,
                fileInfo: fileInfo,
            };
            return record;
        })
            .reverse();
        return result;
    }
    async deleteChatLog(req, body) {
        const { id: userId } = req.user;
        const { id } = body;
        const c = await this.chatLogEntity.findOne({ where: { id, userId } });
        if (!c) {
            throw new common_1.HttpException('你删除的对话记录不存在、请检查！', common_1.HttpStatus.BAD_REQUEST);
        }
        const r = await this.chatLogEntity.update({ id }, { isDelete: true });
        if (r.affected > 0) {
            return '删除对话记录成功！';
        }
        else {
            throw new common_1.HttpException('你删除的对话记录不存在、请检查！', common_1.HttpStatus.BAD_REQUEST);
        }
    }
    async delByGroupId(req, body) {
        const { groupId } = body;
        const { id } = req.user;
        const g = await this.chatGroupEntity.findOne({
            where: { id: groupId, userId: id },
        });
        if (!g) {
            throw new common_1.HttpException('你删除的对话记录不存在、请检查！', common_1.HttpStatus.BAD_REQUEST);
        }
        const r = await this.chatLogEntity.update({ groupId }, { isDelete: true });
        if (r.affected > 0) {
            return '删除对话记录成功！';
        }
        if (r.affected === 0) {
            throw new common_1.HttpException('当前页面已经没有东西可以删除了！', common_1.HttpStatus.BAD_REQUEST);
        }
    }
    async deleteChatsAfterId(req, body) {
        const { id } = body;
        const { id: userId } = req.user;
        const chatLog = await this.chatLogEntity.findOne({ where: { id, userId } });
        if (!chatLog) {
            throw new common_1.HttpException('你删除的对话记录不存在、请检查！', common_1.HttpStatus.BAD_REQUEST);
        }
        const { groupId } = chatLog;
        const result = await this.chatLogEntity.update({ groupId, id: (0, typeorm_2.MoreThanOrEqual)(id) }, { isDelete: true });
        if (result.affected > 0) {
            return '删除对话记录成功！';
        }
        else {
            throw new common_1.HttpException('当前页面已经没有东西可以删除了！', common_1.HttpStatus.BAD_REQUEST);
        }
    }
    async byAppId(req, body) {
        const { id } = req.user;
        const { appId, page = 1, size = 10 } = body;
        const [rows, count] = await this.chatLogEntity.findAndCount({
            where: { userId: id, appId, role: 'assistant' },
            order: { id: 'DESC' },
            take: size,
            skip: (page - 1) * size,
        });
        return { rows, count };
    }
    async checkModelLimits(userId, model) {
        const ONE_HOUR_IN_MS = 3600 * 1000;
        const oneHourAgo = new Date(Date.now() - ONE_HOUR_IN_MS);
        try {
            const usageCount = await this.chatLogEntity.count({
                where: {
                    userId: userId.id,
                    model,
                    createdAt: (0, typeorm_2.MoreThan)(oneHourAgo),
                },
            });
            const adjustedUsageCount = Math.ceil(usageCount / 2);
            common_1.Logger.log(`用户ID: ${userId.id} 一小时内调用 ${model} 模型 ${adjustedUsageCount + 1} 次`, 'ChatLogService');
            let modelInfo;
            if (model.startsWith('gpt-4-gizmo')) {
                modelInfo = await this.modelsService.getCurrentModelKeyInfo('gpts');
            }
            else {
                modelInfo = await this.modelsService.getCurrentModelKeyInfo(model);
            }
            const modelLimits = Number(modelInfo.modelLimits);
            common_1.Logger.log(`模型 ${model} 的使用次数限制为 ${modelLimits}`, 'ChatLogService');
            if (adjustedUsageCount > modelLimits) {
                return true;
            }
            return false;
        }
        catch (error) {
            common_1.Logger.error(`查询数据库出错 - 用户ID: ${userId.id}, 模型: ${model}, 错误信息: ${error.message}`, error.stack, 'ChatLogService');
        }
    }
};
ChatLogService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, typeorm_1.InjectRepository)(chatLog_entity_1.ChatLogEntity)),
    __param(1, (0, typeorm_1.InjectRepository)(user_entity_1.UserEntity)),
    __param(2, (0, typeorm_1.InjectRepository)(chatGroup_entity_1.ChatGroupEntity)),
    __metadata("design:paramtypes", [typeorm_2.Repository,
        typeorm_2.Repository,
        typeorm_2.Repository,
        models_service_1.ModelsService])
], ChatLogService);
exports.ChatLogService = ChatLogService;
