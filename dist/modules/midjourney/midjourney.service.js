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
const badwords_service_1 = require("../badwords/badwords.service");
const userBalance_service_1 = require("../userBalance/userBalance.service");
const utils_1 = require("../../common/utils");
const redisCache_service_1 = require("../redisCache/redisCache.service");
const prompt_entity_1 = require("./prompt.entity");
let MidjourneyService = class MidjourneyService {
    constructor(midjourneyEntity, userEntity, mjPromptsEntity, globalConfigService, uploadService, badwordsService, userBalanceService, redisCacheService) {
        this.midjourneyEntity = midjourneyEntity;
        this.userEntity = userEntity;
        this.mjPromptsEntity = mjPromptsEntity;
        this.globalConfigService = globalConfigService;
        this.uploadService = uploadService;
        this.badwordsService = badwordsService;
        this.userBalanceService = userBalanceService;
        this.redisCacheService = redisCacheService;
        this.lockPrompt = [];
    }
    async sleep(time) {
        return new Promise((resolve) => setTimeout(resolve, time));
    }
    async draw(jobData, jobId) {
        const { id, action } = jobData;
        const drawInfo = await this.midjourneyEntity.findOne({ where: { id } });
        try {
            await this.bindJobId(id, jobId);
            await this.updateDrawStatus(id, midjourney_constant_1.MidjourneyStatusEnum.DRAWING);
            if (action === midjourney_constant_1.MidjourneyActionEnum.DRAW || action === midjourney_constant_1.MidjourneyActionEnum.GENERATE) {
                await this.sendDrawCommand(drawInfo, jobData);
                const drawRes = await this.pollComparisonResultDraw(drawInfo);
                await this.updateDrawData(jobData, drawRes);
            }
            if (action === midjourney_constant_1.MidjourneyActionEnum.UPSCALE) {
                const { message_id, custom_id } = drawInfo;
                await this.sendSmInteractions({ message_id, custom_id }, jobData);
                common_1.Logger.debug(`记录${id}已经成功发送了图片放大指令`, 'MidjourneyService');
                const drawRes = await this.pollComparisonResultUpscale(drawInfo);
                await this.updateDrawData(jobData, drawRes);
            }
            if (action === midjourney_constant_1.MidjourneyActionEnum.VARIATION) {
                const { message_id, custom_id } = drawInfo;
                await this.sendSmInteractions({ message_id, custom_id }, jobData);
                common_1.Logger.debug(`记录${id}已经成功发送了图片变化指令`, 'MidjourneyService');
                const drawRes = await this.pollComparisonResultVariation(drawInfo);
                await this.updateDrawData(jobData, drawRes);
                this.lockPrompt = this.lockPrompt.filter((item) => item !== drawInfo.randomDrawId);
            }
            if (action === midjourney_constant_1.MidjourneyActionEnum.REGENERATE) {
                const { message_id, custom_id } = drawInfo;
                await this.sendReGenerateInteractions({ message_id, custom_id }, jobData);
                common_1.Logger.debug(`记录${id}已经成功发送了重新生成图片指令`, 'MidjourneyService');
                const drawRes = await this.pollComparisonResultReGenerate(drawInfo);
                await this.updateDrawData(jobData, drawRes);
                this.lockPrompt = this.lockPrompt.filter((item) => item !== drawInfo.randomDrawId);
            }
            if (action === midjourney_constant_1.MidjourneyActionEnum.VARY) {
                const { message_id, custom_id } = drawInfo;
                await this.sendVaryInteractions({ message_id, custom_id }, jobData);
                common_1.Logger.debug(`记录${id}已经成功发送单张图片增强指令`, 'MidjourneyService');
                const drawRes = await this.pollComparisonResultVary(drawInfo);
                await this.updateDrawData(jobData, drawRes);
                this.lockPrompt = this.lockPrompt.filter((item) => item !== drawInfo.randomDrawId);
            }
            if (action === midjourney_constant_1.MidjourneyActionEnum.ZOOM) {
                const { message_id, custom_id } = drawInfo;
                await this.sendZoomInteractions({ message_id, custom_id }, jobData);
                common_1.Logger.debug(`记录${id}已经成功发送单张图片缩放指令`, 'MidjourneyService');
                const drawRes = await this.pollComparisonResultZoom(drawInfo);
                await this.updateDrawData(jobData, drawRes);
                this.lockPrompt = this.lockPrompt.filter((item) => item !== drawInfo.randomDrawId);
            }
            return true;
        }
        catch (error) {
            this.lockPrompt = this.lockPrompt.filter((item) => item !== drawInfo.randomDrawId);
            await this.drawFailed(jobData);
            console.log('error: ', error);
            return true;
        }
    }
    async addDrawQueue(params) {
        const { prompt, imgUrl = '', extraParam = '', action = 1, userId, randomDrawId, orderId, custom_id, message_id } = params;
        const fullPrompt = imgUrl ? `${imgUrl} ${prompt} ${extraParam}` : `${prompt} ${extraParam}`;
        await this.badwordsService.checkBadWords(fullPrompt, userId);
        const drawInfo = {
            userId,
            extraParam,
            prompt,
            imgUrl,
            fullPrompt,
            randomDrawId,
            status: midjourney_constant_1.MidjourneyStatusEnum.WAITING,
            action: action,
            orderId,
            custom_id,
            message_id,
        };
        const res = await this.midjourneyEntity.save(drawInfo);
        return res;
    }
    async updateDrawStatus(id, status) {
        await this.midjourneyEntity.update({ id }, { status });
    }
    async updateDrawData(jobData, drawRes) {
        try {
            const { id, content, channel_id, attachments = [], timestamp, durationSpent } = drawRes;
            const { filename, url, proxy_url, width, height, size } = attachments[0];
            const mjNotSaveImg = await this.globalConfigService.getConfigs(['mjNotSaveImg']);
            let cosUrl = '';
            if (!Number(mjNotSaveImg) || Number(mjNotSaveImg) === 0) {
                common_1.Logger.debug(`------> 开始上传图片！！！`, 'MidjourneyService');
                const startDate = new Date();
                cosUrl = await this.uploadService.uploadFileFromUrl({ filename, url });
                const endDate = new Date();
                common_1.Logger.debug(`本次图片上传耗时为${(endDate.getTime() - startDate.getTime()) / 1000}秒`, 'MidjourneyService');
            }
            else {
                console.log('本次不存图片了');
            }
            const cosType = await this.uploadService.getUploadType();
            const drawInfo = {
                status: midjourney_constant_1.MidjourneyStatusEnum.DRAWED,
                message_id: id,
                progress: 100,
                fileInfo: JSON.stringify({ width, height, size, filename, cosUrl, cosType }),
                extend: this.removeEmoji(JSON.stringify(drawRes)),
                durationSpent,
                isSaveImg: !Number(mjNotSaveImg) || Number(mjNotSaveImg) === 0,
            };
            await this.midjourneyEntity.update({ id: jobData.id }, drawInfo);
        }
        catch (error) {
            console.log('TODO->存储图片失败, ', jobData, error);
        }
    }
    async getHistroyMessageIds(randomDrawId) {
        const res = await this.midjourneyEntity.find({ where: { randomDrawId, status: midjourney_constant_1.MidjourneyStatusEnum.DRAWED } });
        return res.map((item) => item.message_id);
    }
    async sendDrawCommand(drawInfo, jobData) {
        const { fullPrompt, randomDrawId, imgUrl } = drawInfo;
        const prompt = imgUrl ? `[${randomDrawId}] ${imgUrl} ${fullPrompt}` : `[${randomDrawId}] ${fullPrompt}`;
        common_1.Logger.debug(`本次绘图指令为${prompt}`, 'MidjourneyService');
        const { application_id, guild_id, channel_id, session_id, version, id, authorization, mjProxy } = await this.getMjDefaultParams();
        const payloadJson = {
            type: 2,
            application_id,
            guild_id,
            channel_id,
            session_id,
            data: { version, id, name: 'imagine', type: 1, options: [{ type: 3, name: 'prompt', value: prompt }], attachments: [] },
        };
        try {
            const mjProxyUrl = (await this.globalConfigService.getConfigs(['mjProxyUrl'])) || 'http://172.247.48.137:8000';
            const url = mjProxy == 1 ? `${mjProxyUrl}/mj/draw` : 'https://discord.com/api/v9/interactions';
            const headers = { authorization };
            const res = await axios_1.default.post(url, payloadJson, { headers });
            return false;
        }
        catch (error) {
            common_1.Logger.error(`发送绘画指令失败`, 'MidjourneyService');
            throw new common_1.HttpException('发送绘图指令失败、请联系管理员检测绘画配置！', common_1.HttpStatus.BAD_REQUEST);
        }
    }
    async sendSmInteractions(params, jobData) {
        const { message_id, custom_id } = params;
        const { application_id, guild_id, channel_id, session_id, version, id, authorization, mjProxy } = await this.getMjDefaultParams();
        const mjProxyUrl = (await this.globalConfigService.getConfigs(['mjProxyUrl'])) || 'http://172.247.48.137:8000';
        const url = mjProxy == 1 ? `${mjProxyUrl}/mj/draw` : 'https://discord.com/api/v9/interactions';
        const headers = { authorization };
        const body = {
            type: 3,
            guild_id,
            channel_id,
            message_flags: 0,
            message_id,
            application_id,
            session_id,
            data: {
                component_type: 2,
                custom_id,
            },
        };
        try {
            await axios_1.default.post(url, body, { headers });
        }
        catch (error) {
            console.log('发送放大变幻指令失败: ', error);
            common_1.Logger.error(`发送放大变幻指令失败`, 'MidjourneyService');
            throw new common_1.HttpException('对图片放大变幻失败...', common_1.HttpStatus.BAD_REQUEST);
        }
    }
    async sendReGenerateInteractions(params, jobData) {
        const { message_id, custom_id } = params;
        const { application_id, guild_id, channel_id, session_id, version, id, authorization, mjProxy } = await this.getMjDefaultParams();
        const mjProxyUrl = (await this.globalConfigService.getConfigs(['mjProxyUrl'])) || 'http://172.247.48.137:8000';
        const url = mjProxy == 1 ? `${mjProxyUrl}/mj/draw` : 'https://discord.com/api/v9/interactions';
        const headers = { authorization };
        const body = {
            type: 3,
            guild_id,
            channel_id,
            message_id,
            application_id,
            session_id,
            data: {
                component_type: 2,
                custom_id,
            },
        };
        try {
            await axios_1.default.post(url, body, { headers });
        }
        catch (error) {
            console.log('发送重新生成指令失败: ', error);
            common_1.Logger.error(`发送放大变幻指令失败`, 'MidjourneyService');
            throw new common_1.HttpException('对图片放大变幻失败...', common_1.HttpStatus.BAD_REQUEST);
        }
    }
    async sendVaryInteractions(params, jobData) {
        const { message_id, custom_id } = params;
        const { application_id, guild_id, channel_id, session_id, version, id, authorization, mjProxy } = await this.getMjDefaultParams();
        const mjProxyUrl = (await this.globalConfigService.getConfigs(['mjProxyUrl'])) || 'http://172.247.48.137:8000';
        const url = mjProxy == 1 ? `${mjProxyUrl}/mj/draw` : 'https://discord.com/api/v9/interactions';
        const headers = { authorization };
        const body = {
            type: 3,
            guild_id,
            channel_id,
            message_id,
            application_id,
            session_id,
            data: {
                component_type: 2,
                custom_id,
            },
        };
        try {
            await axios_1.default.post(url, body, { headers });
        }
        catch (error) {
            console.log('发送对单张图片增强指令失败: ', error);
            common_1.Logger.error(`发送单张图片增强指令失败`, 'MidjourneyService');
            throw new common_1.HttpException('对图片单张增强失败...', common_1.HttpStatus.BAD_REQUEST);
        }
    }
    async sendZoomInteractions(params, jobData) {
        const { message_id, custom_id } = params;
        const { application_id, guild_id, channel_id, session_id, version, id, authorization, mjProxy } = await this.getMjDefaultParams();
        const mjProxyUrl = (await this.globalConfigService.getConfigs(['mjProxyUrl'])) || 'http://172.247.48.137:8000';
        const url = mjProxy == 1 ? `${mjProxyUrl}/mj/draw` : 'https://discord.com/api/v9/interactions';
        const headers = { authorization };
        const body = {
            type: 3,
            guild_id,
            channel_id,
            message_id,
            application_id,
            session_id,
            data: {
                component_type: 2,
                custom_id,
            },
        };
        try {
            await axios_1.default.post(url, body, { headers });
        }
        catch (error) {
            console.log('发送对单张图片增强指令失败: ', error);
            common_1.Logger.error(`发送单张图片增强指令失败`, 'MidjourneyService');
            throw new common_1.HttpException('对图片单张增强失败...', common_1.HttpStatus.BAD_REQUEST);
        }
    }
    async pollComparisonResultDraw(drawInfo) {
        common_1.Logger.debug(`开始查询绘画结果`, 'MidjourneyService');
        const startTime = Date.now();
        const INTERVAL_BEFORE_90S = 10000;
        const INTERVAL_AFTER_90S = 30000;
        const timeout = (await this.globalConfigService.getConfigs(['mjTimeoutMs'])) || 150000;
        const TIMEOUT = timeout;
        let pollingCount = 0;
        let drawRes = null;
        let isMatchSuccessful = false;
        try {
            while (!isMatchSuccessful && Date.now() - startTime < TIMEOUT) {
                let interval;
                if (Date.now() - startTime < 90000) {
                    interval = INTERVAL_BEFORE_90S;
                }
                else {
                    interval = INTERVAL_AFTER_90S;
                }
                await this.sleep(interval);
                common_1.Logger.debug(`【绘制图片】第 ${pollingCount + 1} 次开始查询`, 'MidjourneyService');
                drawRes = await this.findCurrentPromptResult(drawInfo.randomDrawId);
                if (drawRes) {
                    const { content } = drawRes;
                    const progress = await this.parseProgress(content);
                    common_1.Logger.debug(`【绘制图片】第 ${pollingCount + 1} 次、 当前绘画进度为${progress}%`, 'MidjourneyService');
                    await this.midjourneyEntity.update({ id: drawInfo.id }, { progress: progress !== null && progress !== void 0 ? progress : 100 });
                }
                isMatchSuccessful = drawRes && !drawRes.edited_timestamp;
                pollingCount++;
            }
            if (!drawRes) {
                await this.updateDrawStatus(drawInfo.id, midjourney_constant_1.MidjourneyStatusEnum.DRAWTIMEOUT);
                throw new common_1.HttpException('绘画超时，请稍后再试！', common_1.HttpStatus.BAD_REQUEST);
            }
            const endTime = Date.now();
            return Object.assign(Object.assign({}, drawRes), { durationSpent: Math.floor((endTime - startTime) / 1000) });
        }
        catch (error) {
            console.log('获取图片列表结果失败: ', error);
        }
    }
    async pollComparisonResultUpscale(drawInfo) {
        common_1.Logger.debug(`开始查询放大图片信息`, 'MidjourneyService');
        const startTime = Date.now();
        const { message_id, custom_id, randomDrawId, orderId } = drawInfo;
        let enlargeImgDetail = null;
        let pollingCount = 0;
        while (!enlargeImgDetail && pollingCount < 10) {
            common_1.Logger.debug(`开始比对放大图片第${pollingCount + 1}次`, 'MidjourneyService');
            enlargeImgDetail = await this.findCurrentEnlargeImgResult(randomDrawId, orderId);
            await new Promise((resolve) => setTimeout(resolve, Math.floor(Math.random() * (5000 - 3000 + 1)) + 3000));
            pollingCount++;
        }
        if (!enlargeImgDetail) {
            await this.updateDrawStatus(drawInfo.id, midjourney_constant_1.MidjourneyStatusEnum.DRAWTIMEOUT);
            throw new common_1.HttpException('放大图片超时，请稍后再试！', common_1.HttpStatus.BAD_REQUEST);
        }
        const endTime = Date.now();
        return Object.assign(Object.assign({}, enlargeImgDetail), { durationSpent: Math.floor((endTime - startTime) / 1000) });
    }
    async pollComparisonResultReGenerate(drawInfo) {
        common_1.Logger.debug(`开始查询重复绘制的图片信息`, 'MidjourneyService');
        const TIMEOUT = (await this.globalConfigService.getConfigs(['mjTimeoutMs'])) || 150000;
        const startTime = Date.now();
        const { message_id, custom_id, randomDrawId, orderId } = drawInfo;
        let reGenerateImgDetail = null;
        let pollingTime = 0;
        let count = 0;
        while (!reGenerateImgDetail && pollingTime < TIMEOUT) {
            common_1.Logger.debug(`开始比对重新绘制图片第${count + 1}次`, 'MidjourneyService');
            reGenerateImgDetail = await this.findCurrentReGenerateImgResult(randomDrawId, message_id);
            const t = Math.floor(Math.random() * (5000 - 3000 + 1)) + 8000;
            await new Promise((resolve) => setTimeout(resolve, t));
            pollingTime += t;
            count++;
        }
        if (!reGenerateImgDetail) {
            await this.updateDrawStatus(drawInfo.id, midjourney_constant_1.MidjourneyStatusEnum.DRAWTIMEOUT);
            throw new common_1.HttpException('重新绘制图片超时，请稍后再试！', common_1.HttpStatus.BAD_REQUEST);
        }
        const endTime = Date.now();
        return Object.assign(Object.assign({}, reGenerateImgDetail), { durationSpent: Math.floor((endTime - startTime) / 1000) });
    }
    async pollComparisonResultVary(drawInfo) {
        common_1.Logger.debug(`开始查询单张图片增强的图片信息`, 'MidjourneyService');
        const TIMEOUT = (await this.globalConfigService.getConfigs(['mjTimeoutMs'])) || 150000;
        const startTime = Date.now();
        const { message_id, custom_id, randomDrawId, orderId } = drawInfo;
        let varyImgDetail = null;
        let pollingTime = 0;
        let count = 0;
        while (!varyImgDetail && pollingTime < TIMEOUT) {
            common_1.Logger.debug(`开始单张图片增强第${count + 1}次`, 'MidjourneyService');
            varyImgDetail = await this.findCurrentVaryImgResult(randomDrawId, message_id);
            const t = Math.floor(Math.random() * (5000 - 3000 + 1)) + 8000;
            await new Promise((resolve) => setTimeout(resolve, t));
            pollingTime += t;
            count++;
        }
        if (!varyImgDetail) {
            await this.updateDrawStatus(drawInfo.id, midjourney_constant_1.MidjourneyStatusEnum.DRAWTIMEOUT);
            throw new common_1.HttpException('单张图片增强超时，请稍后再试！', common_1.HttpStatus.BAD_REQUEST);
        }
        const endTime = Date.now();
        return Object.assign(Object.assign({}, varyImgDetail), { durationSpent: Math.floor((endTime - startTime) / 1000) });
    }
    async pollComparisonResultZoom(drawInfo) {
        common_1.Logger.debug(`开始查询单张图片缩放的图片信息`, 'MidjourneyService');
        const TIMEOUT = (await this.globalConfigService.getConfigs(['mjTimeoutMs'])) || 150000;
        const startTime = Date.now();
        const { message_id, custom_id, randomDrawId, orderId } = drawInfo;
        let zoomImgDetail = null;
        let pollingTime = 0;
        let count = 0;
        while (!zoomImgDetail && pollingTime < TIMEOUT) {
            common_1.Logger.debug(`开始单张图片缩放第${count + 1}次`, 'MidjourneyService');
            zoomImgDetail = await this.findCurrentZoomImgResult(randomDrawId, message_id);
            const t = Math.floor(Math.random() * (5000 - 3000 + 1)) + 8000;
            await new Promise((resolve) => setTimeout(resolve, t));
            pollingTime += t;
            count++;
        }
        if (!zoomImgDetail) {
            await this.updateDrawStatus(drawInfo.id, midjourney_constant_1.MidjourneyStatusEnum.DRAWTIMEOUT);
            throw new common_1.HttpException('单张图片缩放超时，请稍后再试！', common_1.HttpStatus.BAD_REQUEST);
        }
        const endTime = Date.now();
        return Object.assign(Object.assign({}, zoomImgDetail), { durationSpent: Math.floor((endTime - startTime) / 1000) });
    }
    async pollComparisonResultVariation(drawInfo) {
        common_1.Logger.debug(`开始轮询单张变换图片结果`, 'MidjourneyService');
        let variationImgDetail = null;
        const startTime = Date.now();
        while (!variationImgDetail) {
            common_1.Logger.debug(`变换图片获取中------>`, 'MidjourneyService');
            variationImgDetail = await this.findCurrentVariationImgResult(drawInfo.randomDrawId);
            const nextPollingDelay = 10000;
            await this.sleep(nextPollingDelay);
            const endTime = Date.now();
            const durationSpent = Math.floor(endTime - startTime);
            const timeout = (await this.globalConfigService.getConfigs(['mjTimeoutMs'])) || 150000;
            const TIMEOUT = timeout;
            if (durationSpent >= TIMEOUT) {
                await this.updateDrawStatus(drawInfo.id, midjourney_constant_1.MidjourneyStatusEnum.DRAWTIMEOUT);
                throw new common_1.HttpException('变换当前图片超时！', common_1.HttpStatus.BAD_REQUEST);
            }
        }
        return Object.assign(Object.assign({}, variationImgDetail), { durationSpent: Math.floor(Date.now() - startTime) });
    }
    async findCurrentEnlargeImgResult(randomDrawId, orderId) {
        const messageList = await this.getMessageList();
        const histroyMessageIds = await this.getHistroyMessageIds(randomDrawId);
        const enlargeImgDetail = messageList.find((item) => {
            const { content } = item;
            if (!this.extractContent(content))
                return false;
            const { prompt, order } = this.extractContent(content);
            return content.includes(randomDrawId) && orderId === order && !histroyMessageIds.includes(item.id);
        });
        return enlargeImgDetail;
    }
    async findCurrentVariationImgResult(randomDrawId) {
        const messageList = await this.getMessageList();
        const histroyMessageIds = await this.getHistroyMessageIds(randomDrawId);
        const variationImgDetail = messageList.find((item) => {
            const { content } = item;
            return content.includes(randomDrawId) && !histroyMessageIds.includes(item.id) && this.isVariationsImage(content);
        });
        if (variationImgDetail) {
            if (this.lockPrompt.includes(randomDrawId)) {
                common_1.Logger.debug(`【变体图片】当前图片已经被锁定，等待同任务完成`, 'MidjourneyService');
                return null;
            }
            else {
                this.lockPrompt.push(randomDrawId);
            }
        }
        return variationImgDetail;
    }
    async findCurrentReGenerateImgResult(randomDrawId, message_id) {
        const messageList = await this.getMessageList();
        const histroyMessageIds = await this.getHistroyMessageIds(randomDrawId);
        const reGenerateImgDetail = messageList.find((item) => {
            const { content } = item;
            return content.includes(randomDrawId) && !histroyMessageIds.includes(item.id) && item.id !== message_id && this.isReGenerateImage(content);
        });
        if (reGenerateImgDetail) {
            if (this.lockPrompt.includes(randomDrawId)) {
                common_1.Logger.debug(`【重新生成图片】当前图片已经被锁定，等待同任务完成`, 'MidjourneyService');
                return null;
            }
            else {
                this.lockPrompt.push(randomDrawId);
            }
        }
        return reGenerateImgDetail;
    }
    async findCurrentZoomImgResult(randomDrawId, message_id) {
        const messageList = await this.getMessageList();
        const histroyMessageIds = await this.getHistroyMessageIds(randomDrawId);
        const reGenerateImgDetail = messageList.find((item) => {
            const { content } = item;
            return content.includes(randomDrawId) && !histroyMessageIds.includes(item.id) && item.id !== message_id && this.isZoomImage(content);
        });
        if (reGenerateImgDetail) {
            if (this.lockPrompt.includes(randomDrawId)) {
                common_1.Logger.debug(`【重新生成图片】当前图片已经被锁定，等待同任务完成`, 'MidjourneyService');
                return null;
            }
            else {
                this.lockPrompt.push(randomDrawId);
            }
        }
        return reGenerateImgDetail;
    }
    async findCurrentVaryImgResult(randomDrawId, message_id) {
        const messageList = await this.getMessageList();
        const histroyMessageIds = await this.getHistroyMessageIds(randomDrawId);
        const varyImgDetail = messageList.find((item) => {
            const { content } = item;
            return content.includes(randomDrawId) && !histroyMessageIds.includes(item.id) && item.id !== message_id && this.isVaryImage(content);
        });
        if (varyImgDetail) {
            if (this.lockPrompt.includes(randomDrawId)) {
                common_1.Logger.debug(`【单张图片增强】当前图片已经被锁定，等待同任务完成`, 'MidjourneyService');
                return null;
            }
            else {
                this.lockPrompt.push(randomDrawId);
            }
        }
        return varyImgDetail;
    }
    extractContent(str) {
        const promptMatch = str.match(/\*\*(.+?)\*\*/);
        const orderMatch = str.match(/- Image #(\d+)/);
        if (!promptMatch || !orderMatch) {
            return null;
        }
        const prompt = promptMatch[1];
        const order = parseInt(orderMatch[1]);
        return { prompt, order };
    }
    async findCurrentPromptResult(randomDrawId) {
        const histroyMessageIds = await this.getHistroyMessageIds(randomDrawId);
        const messageList = await this.getMessageList();
        if (!messageList || !messageList.length)
            return;
        const matchingItem = messageList.find((item) => {
            const { attachments = [], content, edited_timestamp } = item;
            return content.includes(randomDrawId) && attachments.length > 0 && !histroyMessageIds.includes(item === null || item === void 0 ? void 0 : item.id);
        });
        return matchingItem || null;
    }
    isVariationsImage(str) {
        const regex = /- Variations/;
        return regex.test(str);
    }
    isSingleImage(str) {
        const regex = /Image #\d+/;
        return regex.test(str);
    }
    isReGenerateImage(str) {
        return !this.isVariationsImage(str) && !this.isSingleImage(str);
    }
    isVaryImage(str) {
        const regex = /- Variations \(.*?\)/;
        return regex.test(str);
    }
    isZoomImage(str) {
        const regex = /- Zoom Out/;
        return regex.test(str);
    }
    async getMjDefaultParams() {
        const configs = await this.globalConfigService.getConfigs([
            'mjId',
            'mjApplicationId',
            'mjGuildId',
            'mjChannelId',
            'mjSessionId',
            'mjVersion',
            'mjAuthorization',
            'mjRateLimit',
            'mjProxy',
        ]);
        const params = {
            application_id: configs.mjApplicationId,
            guild_id: configs.mjGuildId,
            channel_id: configs.mjChannelId,
            session_id: configs.mjSessionId,
            version: configs.mjVersion,
            id: configs.mjId,
            authorization: configs.mjAuthorization,
            mjRateLimit: configs.mjRateLimit,
            mjProxy: configs.mjProxy || 0,
        };
        return params;
    }
    async getMessageList() {
        try {
            const { application_id, guild_id, channel_id, session_id, version, id, authorization, mjProxy } = await this.getMjDefaultParams();
            const mjProxyUrl = (await this.globalConfigService.getConfigs(['mjProxyUrl'])) || 'http://172.247.48.137:8000';
            const url = mjProxy == 1 ? `${mjProxyUrl}/mj/list?channel_id=${channel_id}` : `https://discord.com/api/v9/channels/${channel_id}/messages?limit=50`;
            const headers = { authorization };
            const response = await axios_1.default.get(url, { headers });
            return response.data;
        }
        catch (error) {
            common_1.Logger.error('查询绘制结果失败: getMessageList', error, 'MidjourneyService');
            return [];
        }
    }
    parseProgress(content) {
        const regex = /\((\d+)%\)/;
        const match = content.match(regex);
        if (match) {
            return parseInt(match[1], 10);
        }
        else {
            return null;
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
            });
            const mjProxyImgUrl = await this.globalConfigService.getConfigs(['mjProxyImgUrl']);
            rows.forEach((item) => {
                var _a, _b, _c, _d;
                try {
                    const { extend, isSaveImg, fileInfo } = item;
                    const originUrl = (_b = (_a = JSON.parse(extend)) === null || _a === void 0 ? void 0 : _a.attachments[0]) === null || _b === void 0 ? void 0 : _b.url;
                    item.fileInfo = this.formatFileInfo(fileInfo, isSaveImg, mjProxyImgUrl, originUrl);
                    item.isGroup = ((_d = (_c = JSON.parse(extend)) === null || _c === void 0 ? void 0 : _c.components[0]) === null || _d === void 0 ? void 0 : _d.components[0].label) === "U1";
                    item.originUrl = originUrl;
                }
                catch (error) {
                }
            });
            const countQueue = await this.midjourneyEntity.count({ where: { isDelete: 0, status: (0, typeorm_2.In)([1, 2]) } });
            const data = { rows: (0, utils_1.formatCreateOrUpdateDate)(rows), count, countQueue };
            return data;
        }
        catch (error) {
            throw new common_1.HttpException('获取我得绘制列表失败', common_1.HttpStatus.BAD_REQUEST);
        }
    }
    formatFileInfo(fileInfo, isSaveImg, mjProxyImgUrl, originUrl) {
        if (!fileInfo)
            return {};
        let parseFileInfo = null;
        try {
            parseFileInfo = JSON.parse(fileInfo);
        }
        catch (error) {
            parseFileInfo = null;
        }
        if (!parseFileInfo)
            return;
        const { url, filename, size, cosUrl, width, height } = parseFileInfo;
        const targetSize = 310;
        const imgType = cosUrl.includes('cos') ? 'tencent' : cosUrl.includes('oss') ? 'ali' : 'chevereto';
        let compress;
        let thumbImg;
        if (imgType === 'tencent') {
            const ratio = width / height;
            const targetHeight = Math.round(targetSize / ratio);
            thumbImg = cosUrl + `?imageView2/1/w/${targetSize}/h/${targetHeight}/q/55`;
        }
        if (imgType === 'ali') {
            const ratio = height / width;
            const targetWidth = Math.round(targetSize / ratio);
            thumbImg = cosUrl + `?x-oss-process=image/resize,w_${targetWidth}`;
        }
        if (imgType === 'chevereto') {
            thumbImg = cosUrl.replace(/\.png$/, '.md.png');
        }
        parseFileInfo.thumbImg = thumbImg;
        if (!isSaveImg) {
            const proxyImgUrl = `${mjProxyImgUrl}/mj/pipe?url=${originUrl}`;
            parseFileInfo.thumbImg = proxyImgUrl;
            parseFileInfo.cosUrl = proxyImgUrl;
        }
        return parseFileInfo;
    }
    async getDrawActionDetail(action, drawId, orderId) {
        const detailInfo = await this.midjourneyEntity.findOne({ where: { id: drawId } });
        if (!detailInfo)
            throw new common_1.HttpException('当前绘画信息不存在！', common_1.HttpStatus.BAD_REQUEST);
        const { extend, message_id, prompt, imgUrl, extraParam, randomDrawId } = detailInfo;
        const historyDetailDrawInfo = JSON.parse(extend);
        const { components = [] } = historyDetailDrawInfo;
        if (!components.length) {
            throw new common_1.HttpException('当前图片没有绘画信息、无法放大!', common_1.HttpStatus.BAD_REQUEST);
        }
        let currentImgComponent = {};
        if (action === midjourney_constant_1.MidjourneyActionEnum.UPSCALE) {
            currentImgComponent = components[0]['components'][orderId - 1];
        }
        if (action === midjourney_constant_1.MidjourneyActionEnum.VARIATION) {
            currentImgComponent = components[1]['components'][orderId - 1];
        }
        if (action === midjourney_constant_1.MidjourneyActionEnum.REGENERATE) {
            currentImgComponent = components[0]['components'][orderId - 1];
        }
        if (action === midjourney_constant_1.MidjourneyActionEnum.VARY) {
            currentImgComponent = components[0]['components'][orderId - 1];
        }
        if (action === midjourney_constant_1.MidjourneyActionEnum.ZOOM) {
            currentImgComponent = components[1]['components'][orderId - 1];
        }
        const { custom_id } = currentImgComponent;
        return { custom_id, message_id, prompt, imgUrl, extraParam, randomDrawId };
    }
    async checkIsUpscale(custom_id) {
        const count = await this.midjourneyEntity.count({ where: { custom_id, status: midjourney_constant_1.MidjourneyStatusEnum.DRAWED } });
        if (count > 0) {
            throw new common_1.HttpException('当前图片已经放大过了！', common_1.HttpStatus.BAD_REQUEST);
        }
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
        const amount = action === 2 ? 1 : 4;
        await this.userBalanceService.refundMjBalance(userId, amount);
        await this.midjourneyEntity.update({ id }, { status: 4 });
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
            select: ['fileInfo', 'extend', 'prompt', 'createdAt', 'id', 'extend', 'fullPrompt', 'rec', 'isSaveImg'],
        });
        const mjProxyImgUrl = await this.globalConfigService.getConfigs(['mjProxyImgUrl']);
        rows.forEach((item) => {
            var _a, _b, _c, _d;
            try {
                const { extend, isSaveImg, fileInfo } = item;
                const originUrl = (_b = (_a = JSON.parse(extend)) === null || _a === void 0 ? void 0 : _a.attachments[0]) === null || _b === void 0 ? void 0 : _b.url;
                item.fileInfo = this.formatFileInfo(fileInfo, isSaveImg, mjProxyImgUrl, originUrl);
                item.isGroup = ((_d = (_c = JSON.parse(extend)) === null || _c === void 0 ? void 0 : _c.components[0]) === null || _d === void 0 ? void 0 : _d.components[0].label) === "U1";
                item.originUrl = originUrl;
            }
            catch (error) {
            }
        });
        if (Number(size) === 999) {
            const data = {
                rows: rows.map((item) => {
                    const { fileInfo, prompt, createdAt, id, fullPrompt, rec, originUrl } = item;
                    return { fileInfo, prompt, createdAt, id, fullPrompt, rec, originUrl };
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
            const mjProxyImgUrl = await this.globalConfigService.getConfigs(['mjProxyImgUrl']);
            rows.forEach((item) => {
                var _a, _b, _c, _d;
                try {
                    const { extend, isSaveImg, fileInfo } = item;
                    const originUrl = (_b = (_a = JSON.parse(extend)) === null || _a === void 0 ? void 0 : _a.attachments[0]) === null || _b === void 0 ? void 0 : _b.url;
                    item.fileInfo = this.formatFileInfo(fileInfo, isSaveImg, mjProxyImgUrl, originUrl);
                    item.isGroup = ((_d = (_c = JSON.parse(extend)) === null || _c === void 0 ? void 0 : _c.components[0]) === null || _d === void 0 ? void 0 : _d.components[0].label) === "U1";
                    item.originUrl = originUrl;
                }
                catch (error) {
                }
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
        badwords_service_1.BadwordsService,
        userBalance_service_1.UserBalanceService,
        redisCache_service_1.RedisCacheService])
], MidjourneyService);
exports.MidjourneyService = MidjourneyService;
