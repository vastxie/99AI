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
exports.MidjourneyService = void 0;
const user_entity_1 = require("./../user/user.entity");
const common_1 = require("@nestjs/common");
const typeorm_1 = require("@nestjs/typeorm");
const midjourney_entity_1 = require("./midjourney.entity");
const typeorm_2 = require("typeorm");
const axios_1 = require("axios");
const globalConfig_service_1 = require("../globalConfig/globalConfig.service");
const midjourney_constant_1 = require("../../common/constants/midjourney.constant");
const upload_service_1 = require("../upload/upload.service");
const userBalance_service_1 = require("../userBalance/userBalance.service");
const utils_1 = require("../../common/utils");
const redisCache_service_1 = require("../redisCache/redisCache.service");
const prompt_entity_1 = require("./prompt.entity");
const image_size_1 = require("image-size");
let MidjourneyService = class MidjourneyService {
    constructor(midjourneyEntity, userEntity, mjPromptsEntity, globalConfigService, uploadService, userBalanceService, redisCacheService) {
        this.midjourneyEntity = midjourneyEntity;
        this.userEntity = userEntity;
        this.mjPromptsEntity = mjPromptsEntity;
        this.globalConfigService = globalConfigService;
        this.uploadService = uploadService;
        this.userBalanceService = userBalanceService;
        this.redisCacheService = redisCacheService;
        this.lockPrompt = [];
    }
    async sleep(time) {
        return new Promise((resolve) => setTimeout(resolve, time));
    }
    async getImageSizeFromUrl(imageUrl) {
        try {
            const response = await axios_1.default.get(imageUrl, { responseType: 'arraybuffer' });
            const buffer = Buffer.from(response.data, 'binary');
            const dimensions = (0, image_size_1.default)(buffer);
            return { width: dimensions.width, height: dimensions.height };
        }
        catch (error) {
            console.error('Error fetching image size:', error);
            throw error;
        }
    }
    async draw(jobData, jobId) {
        const { id, action, drawId } = jobData;
        const drawInfo = await this.midjourneyEntity.findOne({ where: { id } });
        const { customId } = drawInfo;
        try {
            await this.bindJobId(id, jobId);
            await this.updateDrawStatus(id, midjourney_constant_1.MidjourneyStatusEnum.DRAWING);
            const result = await this.sendDrawCommand(drawInfo, action);
            drawInfo.drawId = result;
            const drawRes = await this.pollComparisonResultDraw(id, drawInfo);
            await this.updateDrawData(jobData, drawRes);
            this.drawSuccess(jobData);
            return true;
        }
        catch (error) {
            console.log('error: ', error);
            return true;
        }
    }
    async addDrawQueue(params) {
        try {
            const { prompt, imgUrl = '', extraParam = '', action, userId, orderId, customId, drawId } = params;
            const fullPrompt = imgUrl ? `${imgUrl} ${prompt} ${extraParam}` : `${prompt} ${extraParam}`;
            const drawInfo = {
                userId,
                drawId,
                extraParam,
                prompt,
                imgUrl,
                fullPrompt,
                status: midjourney_constant_1.MidjourneyStatusEnum.WAITING,
                action,
                orderId,
                customId,
            };
            const res = await this.midjourneyEntity.save(drawInfo);
            return res;
        }
        catch (error) {
            console.error('Error in addDrawQueue:', error);
            throw error;
        }
    }
    async updateDrawStatus(id, status) {
        await this.midjourneyEntity.update({ id }, { status });
    }
    async updateDrawData(jobData, drawRes) {
        try {
            const { id, imageUrl, action, submitTime, finishTime, progress } = drawRes;
            const durationSpent = finishTime - submitTime;
            let filename = `${Date.now()}-${id}.png`;
            const mjNotSaveImg = await this.globalConfigService.getConfigs(['mjNotSaveImg']);
            let cosUrl = '';
            let isSaveImg = true;
            try {
                if (!Number(mjNotSaveImg) || Number(mjNotSaveImg) === 0) {
                    common_1.Logger.debug(`------> 开始上传图片！！！`, 'MidjourneyService');
                    cosUrl = await this.uploadService.uploadFileFromUrl({ filename, url: imageUrl });
                }
                else {
                    cosUrl = imageUrl;
                    isSaveImg = false;
                    common_1.Logger.debug('本次不存图片了', 'MidjourneyService');
                }
            }
            catch (uploadError) {
                common_1.Logger.error('存储图片失败，使用原始图片链接', 'MidjourneyService');
                cosUrl = imageUrl;
                isSaveImg = false;
            }
            const { width, height } = await this.getImageSizeFromUrl(imageUrl);
            const drawInfo = {
                status: midjourney_constant_1.MidjourneyStatusEnum.DRAWED,
                drawId: id,
                action: action,
                drawUrl: cosUrl,
                drawRatio: `${width}x${height}`,
                progress: 100,
                extend: this.removeEmoji(JSON.stringify(drawRes)),
                durationSpent,
                isSaveImg,
            };
            await this.midjourneyEntity.update({ id: jobData.id }, drawInfo);
        }
        catch (error) {
            throw new common_1.HttpException('更新绘画数据失败', common_1.HttpStatus.BAD_REQUEST);
        }
    }
    async sendDrawCommand(drawInfo, action) {
        const mjProxyUrl = (await this.globalConfigService.getConfigs(['mjProxyUrl']));
        const mjKey = (await this.globalConfigService.getConfigs(['mjKey']));
        const { id, fullPrompt, imgUrl, drawId, customId } = drawInfo;
        const prompt = imgUrl ? `${imgUrl} ${fullPrompt}` : `${fullPrompt}`;
        let url = '';
        let payloadJson = {};
        const MAX_RETRIES = 3;
        let retryCount = 0;
        while (retryCount < MAX_RETRIES) {
            try {
                if (action === 'IMAGINE') {
                    url = `${mjProxyUrl}/mj/submit/imagine`;
                    payloadJson = { prompt: prompt };
                }
                else {
                    url = `${mjProxyUrl}/mj/submit/action`;
                    payloadJson = { taskId: drawId, customId: customId };
                }
                const headers = { "mj-api-secret": mjKey };
                const res = await axios_1.default.post(url, payloadJson, { headers });
                const { result } = res.data;
                if (result) {
                    common_1.Logger.log(`绘画ID: ${result}`, 'MidjourneyService');
                    return result;
                }
                else {
                    throw new Error('未能获取结果数据');
                }
            }
            catch (error) {
                retryCount++;
                if (retryCount >= MAX_RETRIES) {
                    await this.updateDrawStatus(id, midjourney_constant_1.MidjourneyStatusEnum.DRAWFAIL);
                    throw new common_1.HttpException('发送绘图指令失败、请联系管理员检测绘画配置！', common_1.HttpStatus.BAD_REQUEST);
                }
            }
        }
    }
    async pollComparisonResultDraw(id, drawInfo) {
        const mjProxyUrl = (await this.globalConfigService.getConfigs(['mjProxyUrl']));
        const mjKey = (await this.globalConfigService.getConfigs(['mjKey']));
        const startTime = Date.now();
        const POLL_INTERVAL = 5000;
        const TIMEOUT = 150000;
        let pollingCount = 0;
        let retryCount = 0;
        const MAX_RETRIES = 5;
        const { drawId } = drawInfo;
        try {
            while (Date.now() - startTime < TIMEOUT && retryCount < MAX_RETRIES) {
                await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL));
                try {
                    const headers = {
                        "Content-Type": "application/x-www-form-urlencoded",
                        "mj-api-secret": mjKey
                    };
                    const url = `${mjProxyUrl}/mj/task/${drawId}/fetch`;
                    const res = await axios_1.default.get(url, { headers });
                    const responses = res.data;
                    const progress = responses.process;
                    await this.midjourneyEntity.update({ id }, { progress: progress });
                    if (responses.status === 'SUCCESS') {
                        common_1.Logger.log(`绘制成功, URL: ${responses.imageUrl}`, 'MidjourneyService');
                        return responses;
                    }
                }
                catch (error) {
                    retryCount++;
                    common_1.Logger.error(`轮询过程中发生错误: ${error}`, 'MidjourneyService');
                }
                pollingCount++;
            }
            if (retryCount >= MAX_RETRIES) {
                await this.updateDrawStatus(id, midjourney_constant_1.MidjourneyStatusEnum.DRAWFAIL);
                throw new common_1.HttpException('轮询失败次数过多，请稍后再试！', common_1.HttpStatus.BAD_REQUEST);
            }
            common_1.Logger.error('绘画超时，请稍后再试！', 'MidjourneyService');
            await this.updateDrawStatus(id, midjourney_constant_1.MidjourneyStatusEnum.DRAWFAIL);
            throw new common_1.HttpException('绘画超时，请稍后再试！', common_1.HttpStatus.BAD_REQUEST);
        }
        catch (error) {
            common_1.Logger.error('获取图片结果失败: ', error, 'MidjourneyService');
            await this.updateDrawStatus(id, midjourney_constant_1.MidjourneyStatusEnum.DRAWFAIL);
            throw error;
        }
    }
    removeEmoji(str) {
        const regex = /[\uD800-\uDBFF][\uDC00-\uDFFF]/g;
        return str.replace(regex, '');
    }
    async bindJobId(id, jobId) {
        await this.midjourneyEntity.update({ id }, { jobId });
    }
    async getDrawList(req, params) {
        try {
            const { page = 1, size = 30 } = params;
            const [rows, count] = await this.midjourneyEntity.findAndCount({
                where: { userId: req.user.id, isDelete: 0 },
                order: { id: 'DESC' },
                take: size,
                skip: (page - 1) * size,
                select: ['id', 'userId', 'prompt', 'extraParam', 'fullPrompt', 'rec', 'orderId', 'drawId', 'drawUrl', 'drawRatio', 'isDelete', 'status', 'action']
            });
            const countQueue = await this.midjourneyEntity.count({ where: { isDelete: 0, status: (0, typeorm_2.In)([1, 2]) } });
            const data = { rows: (0, utils_1.formatCreateOrUpdateDate)(rows), count, countQueue };
            return data;
        }
        catch (error) {
            throw new common_1.HttpException('获取我得绘制列表失败', common_1.HttpStatus.BAD_REQUEST);
        }
    }
    async getDrawActionDetail(action, drawId, orderId) {
        const detailInfo = await this.midjourneyEntity.findOne({ where: { drawId: drawId } });
        const { extend, prompt, imgUrl, extraParam } = detailInfo;
        const extendObj = JSON.parse(extend);
        const buttons = extendObj.buttons || [];
        let currentButton;
        if (action === 'UPSCALE') {
            currentButton = buttons.find(button => {
                const isStandardUpscale = button.label.startsWith(`U${orderId}`);
                const isUpscaleUpscale = (orderId === 1 && /(Redo )?Upscale \(Subtle\)/.test(button.label)) ||
                    (orderId === 2 && /(Redo )?Upscale \(Creative\)/.test(button.label));
                return isStandardUpscale || isUpscaleUpscale;
            });
        }
        if (action === 'VARIATION') {
            currentButton = buttons.find(button => {
                const isStandardVariation = button.label.startsWith(`V${orderId}`);
                const isVaryVariation = (orderId === 1 && /Vary \(Strong\)/.test(button.label)) ||
                    (orderId === 2 && /Vary \(Region\)/.test(button.label));
                return isStandardVariation || isVaryVariation;
            });
        }
        if (action === 'REGENERATE') {
            currentButton = buttons.find(button => button.customId.startsWith("MJ::JOB::reroll::0::") && button.label === "");
        }
        if (action === 'ZOOM') {
            currentButton = buttons.find(button => (orderId === 1 && button.label === "Zoom Out 2x") ||
                (orderId === 2 && button.label === "Zoom Out 1.5x"));
        }
        if (!currentButton) {
            throw new common_1.HttpException('所需绘画操作信息不存在!', common_1.HttpStatus.BAD_REQUEST);
        }
        const { customId } = currentButton;
        return { customId, prompt, extraParam, drawId };
    }
    async deleteDraw(id, req) {
        const d = await this.midjourneyEntity.findOne({ where: { id, userId: req.user.id, isDelete: 0 } });
        if (!d) {
            throw new common_1.HttpException('当前图片不存在！', common_1.HttpStatus.BAD_REQUEST);
        }
        if (d.status === 2) {
            throw new common_1.HttpException('绘制中的图片任务、禁止删除！', common_1.HttpStatus.BAD_REQUEST);
        }
        const res = await this.midjourneyEntity.update({ id }, { isDelete: 1 });
        if (res.affected > 0) {
            return '删除成功！';
        }
        else {
            throw new common_1.HttpException('删除失败！', common_1.HttpStatus.BAD_REQUEST);
        }
    }
    async checkLimit(req) {
        const { role, id } = req.user;
        const count = await this.midjourneyEntity.count({ where: { userId: id, isDelete: 0, status: (0, typeorm_2.In)([1, 2]) } });
        const mjLimitCount = await this.globalConfigService.getConfigs(['mjLimitCount']);
        const max = mjLimitCount ? Number(mjLimitCount) : 2;
        if (count >= max) {
            throw new common_1.HttpException(`当前管理员限制单用户同时最多能执行${max}个任务`, common_1.HttpStatus.BAD_REQUEST);
        }
    }
    async drawFailed(jobData) {
        const { id, userId, action } = jobData;
        await this.midjourneyEntity.update({ id }, { status: 4 });
    }
    async drawSuccess(jobData) {
        const { id, userId, action } = jobData;
        const amount = action === "UPSCALE" ? 1 : 4;
        common_1.Logger.debug(`绘画完成，执行扣费，扣除费用:${amount}积分。`);
        await this.userBalanceService.refundMjBalance(userId, -amount);
        await this.midjourneyEntity.update({ id }, { status: 3 });
    }
    async getList(params) {
        const { page = 1, size = 20, rec, userId, status } = params;
        if (Number(size) === 999) {
            const cache = await this.redisCacheService.get({ key: 'midjourney:getList' });
            if (cache) {
                try {
                    return JSON.parse(cache);
                }
                catch (error) {
                    return [];
                }
            }
        }
        const where = { isDelete: 0 };
        rec && Object.assign(where, { rec });
        userId && Object.assign(where, { userId });
        status && Object.assign(where, { status });
        const [rows, count] = await this.midjourneyEntity.findAndCount({
            where,
            order: { id: 'DESC' },
            take: size,
            skip: (page - 1) * size,
            select: ['id', 'drawId', 'drawUrl', 'drawRatio', 'prompt', 'fullPrompt', 'rec', 'createdAt', 'action', 'status'],
        });
        if (Number(size) === 999) {
            const data = {
                rows: rows.map((item) => {
                    const { id, drawId, drawUrl, drawRatio, prompt, fullPrompt, createdAt, rec, action, status } = item;
                    return { id, drawId, drawUrl, drawRatio, prompt, fullPrompt, createdAt, rec, action, status };
                }),
                count,
            };
            await this.redisCacheService.set({ key: 'midjourney:getList', val: JSON.stringify(data) }, 60 * 5);
            return data;
        }
        const data = { rows, count };
        return data;
    }
    async getFullPrompt(id) {
        const m = await this.midjourneyEntity.findOne({ where: { id } });
        if (!m)
            return '';
        const { fullPrompt } = m;
        return fullPrompt;
    }
    async getAdminDrawList(req, params) {
        try {
            const { page = 1, size = 10, rec, userId, status } = params;
            const where = { isDelete: 0 };
            rec && Object.assign(where, { rec });
            userId && Object.assign(where, { userId });
            status && Object.assign(where, { status });
            const [rows, count] = await this.midjourneyEntity.findAndCount({
                where,
                order: { id: 'DESC' },
                take: size,
                skip: (page - 1) * size,
            });
            const userIds = rows.map((item) => item.userId).filter(id => id < 100000);
            const userInfos = await this.userEntity.find({ where: { id: (0, typeorm_2.In)(userIds) }, select: ['id', 'username', 'avatar', 'email'] });
            rows.forEach((item) => {
                item.userInfo = userInfos.find((user) => user.id === item.userId);
            });
            if (req.user.role !== 'super') {
                rows.forEach((item) => {
                    if (item.userInfo && item.userInfo.email) {
                        item.userInfo.email = item.userInfo.email.replace(/(.{2}).+(.{2}@.+)/, '$1****$2');
                    }
                });
            }
            return { rows, count };
        }
        catch (error) {
            throw new common_1.HttpException('查询失败！', common_1.HttpStatus.BAD_REQUEST);
        }
    }
    async recDraw(params) {
        const { id } = params;
        const draw = await this.midjourneyEntity.findOne({ where: { id, status: 3, isDelete: 0 } });
        if (!draw) {
            throw new common_1.HttpException('当前图片不存在！', common_1.HttpStatus.BAD_REQUEST);
        }
        const { rec } = draw;
        const res = await this.midjourneyEntity.update({ id }, { rec: rec === 1 ? 0 : 1 });
        if (res.affected > 0) {
            return '操作成功！';
        }
    }
    async cleanQueue() {
        try {
            await this.midjourneyEntity.update({ status: 2 }, { status: 4 });
        }
        catch (error) {
            console.log('TODO->error: ', error);
        }
    }
    async delLog(req, body) {
        const { id } = body;
        if (!id) {
            throw new common_1.HttpException('非法操作！', common_1.HttpStatus.BAD_REQUEST);
        }
        const res = await this.midjourneyEntity.delete({ id });
        if (res.affected > 0) {
            return '删除记录成功！';
        }
        else {
            throw new common_1.HttpException('删除记录失败！', common_1.HttpStatus.BAD_REQUEST);
        }
    }
    async setPrompt(req, body) {
        try {
            const { prompt, status, isCarryParams, title, order, id, aspect } = body;
            if (id) {
                return await this.mjPromptsEntity.update({ id }, { prompt, status, isCarryParams, order, aspect });
            }
            else {
                return await this.mjPromptsEntity.save({ prompt, status, isCarryParams, title, order, aspect });
            }
        }
        catch (error) {
            console.log('error: ', error);
        }
    }
    async delPrompt(req, body) {
        const { id } = body;
        if (!id) {
            throw new common_1.HttpException('非法操作！', common_1.HttpStatus.BAD_REQUEST);
        }
        return await this.mjPromptsEntity.delete({ id });
    }
    async queryPrompt() {
        return await this.mjPromptsEntity.find({
            order: { order: 'DESC' },
        });
    }
    async proxyImg(params) {
        const { url } = params;
        if (!url)
            return;
        const response = await axios_1.default.get(url, { responseType: 'arraybuffer' });
        const base64 = Buffer.from(response.data).toString('base64');
        return base64;
    }
};
MidjourneyService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, typeorm_1.InjectRepository)(midjourney_entity_1.MidjourneyEntity)),
    __param(1, (0, typeorm_1.InjectRepository)(user_entity_1.UserEntity)),
    __param(2, (0, typeorm_1.InjectRepository)(prompt_entity_1.mjPromptEntity)),
    __metadata("design:paramtypes", [typeorm_2.Repository,
        typeorm_2.Repository,
        typeorm_2.Repository,
        globalConfig_service_1.GlobalConfigService,
        upload_service_1.UploadService,
        userBalance_service_1.UserBalanceService,
        redisCache_service_1.RedisCacheService])
], MidjourneyService);
exports.MidjourneyService = MidjourneyService;
