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
exports.MjService = void 0;
const globalConfig_service_1 = require("./../globalConfig/globalConfig.service");
const upload_service_1 = require("./../upload/upload.service");
const common_1 = require("@nestjs/common");
const axios_1 = require("axios");
const chatLog_service_1 = require("../chatLog/chatLog.service");
const balance_constant_1 = require("../../common/constants/balance.constant");
const utils_1 = require("../../common/utils");
const chatLog_entity_1 = require("../chatLog/chatLog.entity");
const typeorm_1 = require("typeorm");
const typeorm_2 = require("@nestjs/typeorm");
const balance_entity_1 = require("../userBalance/balance.entity");
const fanyi_service_1 = require("../fanyi/fanyi.service");
const badwords_service_1 = require("../badwords/badwords.service");
let MjService = class MjService {
    constructor(chatLogEntity, balanceEntity, uploadService, chatLogService, globalConfigService, fanyiService, badwordsService) {
        this.chatLogEntity = chatLogEntity;
        this.balanceEntity = balanceEntity;
        this.uploadService = uploadService;
        this.chatLogService = chatLogService;
        this.globalConfigService = globalConfigService;
        this.fanyiService = fanyiService;
        this.badwordsService = badwordsService;
        this.rateLimits = {};
        this.drawWorking = [];
        this.enlargeWorking = [];
        this.queueCount = 0;
        this.freeQueueUsers = {};
    }
    async mjDraw(data) {
        const { jobId, prompt, startTime, userId } = data;
        console.log('绘画任务开始', 'mjservice');
        await new Promise((resolve) => setTimeout(resolve, 5000));
        return { a: 1, b: 2 };
    }
    async draw(body, req) {
        await this.checkAuth(req);
        await this.badwordsService.checkBadWords(body.prompt, req.user.id);
        const basicPrompt = body.prompt;
        let fyPrompt = body.prompt;
        const { baiduFanyiAppId, baiduFanyiSecret } = await this.globalConfigService.getConfigs(['baiduFanyiAppId', 'baiduFanyiSecret']);
        if (baiduFanyiAppId && baiduFanyiSecret) {
            fyPrompt = await this.fanyiService.convertToEnglish(basicPrompt);
        }
        const randomId = `[${(0, utils_1.createRandomUid)()}]`;
        const prompt = `${randomId} ${fyPrompt}`;
        console.log('randomId: ', randomId);
        console.log('prompt -------->  ', prompt);
        const isWorking = this.drawWorking.find((item) => item.includes(body.prompt));
        if (isWorking) {
            throw new common_1.HttpException('当前提示词已经在任务队列中了、请勿重复提交。。。', common_1.HttpStatus.BAD_REQUEST);
        }
        if (this.queueCount >= 3) {
            throw new common_1.HttpException('当前绘图任务满载、请排队等候、队列任务完成后即可开始您的任务...', common_1.HttpStatus.BAD_REQUEST);
        }
        await this.checkRateLimit(req);
        this.queueCount++;
        console.log(`开始请求用户${req.user.id} 队列+1: `, this.queueCount);
        try {
            const historyDraw = await this.chatLogEntity.find({ where: { prompt: (0, typeorm_1.Like)(`%${prompt}%`) } });
            const histroyMessageIds = historyDraw.map((item) => item.message_id);
            this.drawWorking.push(prompt);
            let drawDetail;
            const sendRes = await this.sendDrawInteractions(prompt, histroyMessageIds, randomId);
            if (sendRes) {
                console.log(`历史中存在当前图片、直接获取！`);
                drawDetail = sendRes;
            }
            else {
                drawDetail = await this.pollForResult(prompt, histroyMessageIds, randomId);
            }
            this.queueCount--;
            this.queueCount < 0 && (this.queueCount = 0);
            console.log('绘制图片任务结束 队列-1: ', this.queueCount);
            const { id, content, channel_id, attachments = [], timestamp } = drawDetail;
            if (!attachments.length || !attachments[0].url) {
                throw new common_1.HttpException('绘画失败', common_1.HttpStatus.BAD_REQUEST);
            }
            const { filename, url, width, height, size } = attachments[0];
            console.log('拿到了远程地址: ', url);
            const mjNotSaveImg = this.globalConfigService.getConfigs(['mjNotSaveImg']);
            let cosUrl = '';
            if (!Number(mjNotSaveImg) || Number(mjNotSaveImg) === 0) {
                cosUrl = await this.uploadService.uploadFileFromUrl({ filename, url });
                console.log('存入图片完成: ', cosUrl);
            }
            const logInfo = {
                curIp: (0, utils_1.getClientIp)(req),
                userId: req.user.id,
                type: balance_constant_1.DeductionKey.PAINT_TYPE,
                prompt,
                answer: cosUrl,
                model: 'mj',
                extend: this.removeEmoji(JSON.stringify(drawDetail)),
                message_id: id,
                variationId: id,
                upscaleId: id,
                group: 1,
                isSaveImg: !Number(mjNotSaveImg) || Number(mjNotSaveImg) === 0,
                fileInfo: JSON.stringify({ width, height, size, filename, cosUrl }),
            };
            await this.chatLogService.saveChatLog(logInfo);
            await this.deductBalance(req);
            this.drawWorking = this.drawWorking.filter((item) => item !== body.prompt);
            return cosUrl;
        }
        catch (error) {
            this.queueCount--;
            this.queueCount < 0 && (this.queueCount = 0);
            console.log('绘制图片任务异常中断 队列-1: ', this.queueCount);
            this.drawWorking = this.drawWorking.filter((item) => item !== body.prompt);
            throw new common_1.HttpException(error.response, common_1.HttpStatus.BAD_REQUEST);
        }
    }
    async upscaleSingleImg(body, req) {
        if (this.queueCount >= 3) {
            throw new common_1.HttpException('当前绘图任务满载、请排队等候、队列任务完成后即可开始您的任务...', common_1.HttpStatus.BAD_REQUEST);
        }
        this.queueCount++;
        console.log(`用户${req.user.id}开始请求放大图片 队列+1: `, this.queueCount);
        const { message_id, orderId } = body;
        try {
            const historyLog = await this.chatLogEntity.findOne({ where: { message_id } });
            if (!historyLog) {
                throw new common_1.HttpException('历史记录中不存在当前图片、请确认您放大的图片是否存在', common_1.HttpStatus.BAD_REQUEST);
            }
            const isAreadlyEnlarge = await this.chatLogEntity.findOne({ where: { upscaleId: message_id, action: 'enlarge', orderId } });
            if (isAreadlyEnlarge) {
                throw new common_1.HttpException('当前图片已经放大过了、请勿重复放大!', common_1.HttpStatus.BAD_REQUEST);
            }
            const { prompt, extend } = historyLog;
            let historyDetailDrawInfo = null;
            try {
                historyDetailDrawInfo = JSON.parse(extend);
            }
            catch (error) {
                historyDetailDrawInfo = [];
            }
            const { components = [] } = historyDetailDrawInfo;
            if (!components.length) {
                throw new common_1.HttpException('当前图片没有绘画信息、无法放大!', common_1.HttpStatus.BAD_REQUEST);
            }
            const currentImgComponent = components[0]['components'][orderId - 1];
            const { custom_id } = currentImgComponent;
            console.log('放大custom_id: ', custom_id);
            const params = { message_id, custom_id, prompt, orderId };
            await this.sendSmInteractions(params);
            console.log('发送放大指令成功');
            const historyDraw = await this.chatLogEntity.find({ where: { prompt: (0, typeorm_1.Like)(`%${prompt}%`) } });
            const histroyMessageIds = historyDraw.map((item) => item.message_id);
            console.log('历史这些id已经被获取过了 不能拿了: ', histroyMessageIds);
            const enlargeImgInfo = await this.pollForUpscaleResult(params, histroyMessageIds);
            this.queueCount--;
            this.queueCount < 0 && (this.queueCount = 0);
            console.log('放大图片任务结束 队列-1: ', this.queueCount);
            const { id, content, channel_id, attachments = [], timestamp } = enlargeImgInfo;
            if (!attachments.length || !attachments[0].url) {
                throw new common_1.HttpException('放大当前图片失败', common_1.HttpStatus.BAD_REQUEST);
            }
            const { filename, url, width, height, size } = attachments[0];
            const mjNotSaveImg = this.globalConfigService.getConfigs(['mjNotSaveImg']);
            let cosUrl = '';
            if (!Number(mjNotSaveImg) || Number(mjNotSaveImg) === 0) {
                cosUrl = await this.uploadService.uploadFileFromUrl({ filename, url });
                console.log('存入图片完成: ', cosUrl);
            }
            const logInfo = {
                curIp: (0, utils_1.getClientIp)(req),
                userId: req.user.id,
                type: balance_constant_1.DeductionKey.PAINT_TYPE,
                prompt,
                answer: cosUrl,
                model: 'mj',
                extend: this.removeEmoji(JSON.stringify(enlargeImgInfo)),
                message_id,
                upscaleId: id,
                variationId: id,
                action: 'enlarge',
                orderId: params.orderId,
                isSaveImg: !Number(mjNotSaveImg) || Number(mjNotSaveImg) === 0,
                fileInfo: JSON.stringify({ width, height, size, filename, cosUrl }),
            };
            await this.chatLogService.saveChatLog(logInfo);
            return cosUrl;
        }
        catch (error) {
            console.log('error: ', error);
            this.queueCount--;
            this.queueCount < 0 && (this.queueCount = 0);
            console.log('放大图片任务异常中断 队列-1: ', this.queueCount);
            throw new common_1.HttpException(error.response, common_1.HttpStatus.BAD_REQUEST);
        }
    }
    async variationSingleImg(body, req) {
        if (this.queueCount >= 3) {
            throw new common_1.HttpException('当前绘图任务满载、请排队等候、队列任务完成后即可开始您的任务...', common_1.HttpStatus.BAD_REQUEST);
        }
        await this.checkAuth(req);
        await this.checkRateLimit(req);
        this.queueCount++;
        console.log(`用户${req.user.id}开始请求变换图片 队列+1: `, this.queueCount);
        const { message_id, orderId } = body;
        try {
            const historyLog = await this.chatLogEntity.findOne({ where: { message_id } });
            if (!historyLog) {
                throw new common_1.HttpException('历史记录中不存在当前图片、请确认您需要变换的图片是否存在', common_1.HttpStatus.BAD_REQUEST);
            }
            const { prompt, extend } = historyLog;
            let historyDetailDrawInfo = null;
            try {
                historyDetailDrawInfo = JSON.parse(extend);
            }
            catch (error) {
                historyDetailDrawInfo = [];
            }
            const { components = [] } = historyDetailDrawInfo;
            if (!components.length) {
                throw new common_1.HttpException('当前图片没有绘画信息、无法变体!', common_1.HttpStatus.BAD_REQUEST);
            }
            const currentImgComponent = components[1]['components'][orderId - 1];
            const { custom_id } = currentImgComponent;
            const historyVariationLog = await this.chatLogEntity.find({ where: { variationId: (0, typeorm_1.Not)((0, typeorm_1.IsNull)()), prompt: (0, typeorm_1.Like)(`%${prompt}%`) } });
            const historyVariationIds = historyVariationLog.map((item) => item.variationId);
            const params = { message_id, custom_id, prompt, orderId };
            await this.sendSmInteractions(params);
            const variationImgInfo = await this.pollForVariationResult(params, historyVariationIds);
            this.queueCount--;
            this.queueCount < 0 && (this.queueCount = 0);
            console.log('变换图片任务结束 队列-1: ', this.queueCount);
            const { id, content, channel_id, attachments = [], timestamp } = variationImgInfo;
            if (!attachments.length || !attachments[0].url) {
                throw new common_1.HttpException('变换当前图片失败', common_1.HttpStatus.BAD_REQUEST);
            }
            const { filename, url, width, height, size } = attachments[0];
            const mjNotSaveImg = this.globalConfigService.getConfigs(['mjNotSaveImg']);
            let cosUrl = '';
            if (!Number(mjNotSaveImg) || Number(mjNotSaveImg) === 0) {
                cosUrl = await this.uploadService.uploadFileFromUrl({ filename, url });
                console.log('存入图片完成: ', cosUrl);
            }
            const logInfo = {
                curIp: (0, utils_1.getClientIp)(req),
                userId: req.user.id,
                type: balance_constant_1.DeductionKey.PAINT_TYPE,
                prompt,
                answer: cosUrl,
                model: 'mj',
                group: 1,
                extend: this.removeEmoji(JSON.stringify(variationImgInfo)),
                message_id: id,
                upscaleId: id,
                variationId: id,
                action: 'enlarge',
                orderId: params.orderId,
                isSaveImg: !Number(mjNotSaveImg) || Number(mjNotSaveImg) === 0,
                fileInfo: JSON.stringify({ width, height, size, filename, cosUrl }),
            };
            await this.chatLogService.saveChatLog(logInfo);
            return cosUrl;
        }
        catch (error) {
            console.log('error: ', error);
            this.queueCount--;
            this.queueCount < 0 && (this.queueCount = 0);
            console.log('变化图片任务异常中断 队列-1: ', this.queueCount);
            throw new common_1.HttpException(error.response, common_1.HttpStatus.BAD_REQUEST);
        }
    }
    async sendSmInteractions(params) {
        const { message_id, custom_id } = params;
        const { application_id, guild_id, channel_id, session_id, version, id, authorization, mjProxy } = await this.getMjDefaultParams();
        const url = mjProxy == 1 ? `http://172.247.48.137:8000/mj/draw` : 'https://discord.com/api/v9/interactions';
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
            console.log('绘图指令完成');
        }
        catch (error) {
            console.log('error: ', error);
            throw new common_1.HttpException('放大单张图片请求失败...', common_1.HttpStatus.BAD_REQUEST);
        }
    }
    async pollForUpscaleResult(params, histroyMessageIds) {
        const { message_id, custom_id, prompt, orderId } = params;
        let enlargeImgDetail = null;
        let pollingCount = 0;
        while (!enlargeImgDetail && pollingCount < 10) {
            try {
                const startTime = Date.now();
                const messageList = await this.queryMessageList();
                console.log(`第 ${pollingCount + 1} 次开始查询 => 当前查询结果：${messageList.length}`);
                if (messageList && messageList.length) {
                    enlargeImgDetail = await this.findCurrentEnlargeImgResult(messageList, params, histroyMessageIds);
                }
                const elapsedTime = Date.now() - startTime;
                const nextPollingDelay = 3000;
                await this.sleep(Math.max(nextPollingDelay - elapsedTime, 0));
                pollingCount++;
            }
            catch (error) {
                console.error(`查询期间出现错误：${error.message}`);
            }
        }
        return enlargeImgDetail;
    }
    async pollForVariationResult(params, historyVariationIds) {
        const { message_id, custom_id, prompt, orderId } = params;
        console.log('开始轮询单张变换图片结果');
        let variationImgDetail = null;
        let pollingCount = 0;
        while (!variationImgDetail && pollingCount < 10) {
            try {
                console.log(`第 ${pollingCount + 1} 次开始查询[变换图片]`);
                const startTime = Date.now();
                const messageList = await this.queryMessageList();
                if (messageList && messageList.length) {
                    variationImgDetail = await this.findCurrentVariationImgResult(messageList, params, historyVariationIds);
                }
                const elapsedTime = Date.now() - startTime;
                const nextPollingDelay = 8000;
                await this.sleep(Math.max(nextPollingDelay - elapsedTime, 0));
                pollingCount++;
            }
            catch (error) {
                console.error(`查询期间出现错误：${error.message}`);
            }
        }
        if (!variationImgDetail) {
            throw new common_1.HttpException('变换当前图片超时！', common_1.HttpStatus.BAD_REQUEST);
        }
        return variationImgDetail;
    }
    async findCurrentEnlargeImgResult(messageList, params, histroyMessageIds) {
        const { message_id, custom_id, prompt, orderId } = params;
        const randomId = prompt.substring(0, 12);
        console.log('本次放大图片的id: ', randomId);
        const enlargeImgDetail = messageList.find((item) => {
            const { content } = item;
            if (!this.extractContent(content))
                return false;
            const { prompt, order } = this.extractContent(content);
            return prompt.includes(randomId) && params.orderId === order && !histroyMessageIds.includes(item.id);
        });
        return enlargeImgDetail;
    }
    async findCurrentVariationImgResult(messageList, params, historyVariationIds) {
        const { message_id, custom_id, prompt, orderId } = params;
        const randomId = prompt.substring(0, 12);
        const variationImgDetail = messageList.find((item) => {
            const { content } = item;
            const promptMatch = content.match(/\*\*(.+?)\*\*/);
            const prompt = promptMatch ? promptMatch[1] : '';
            if (!prompt)
                return false;
            return prompt.includes(randomId) && !historyVariationIds.includes(item.id);
        });
        return variationImgDetail;
    }
    async sendDrawInteractions(prompt, histroyMessageIds, randomId) {
        const messageList = await this.queryMessageList();
        const drawDetail = await this.findCurrentPromptResult(messageList, randomId, histroyMessageIds);
        if (drawDetail) {
            console.log('有历史信息之间返回: ', drawDetail);
            return drawDetail;
        }
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
            const url = mjProxy == 1 ? `http://172.247.48.137:8000/mj/draw` : 'https://discord.com/api/v9/interactions';
            const headers = { authorization };
            const res = await axios_1.default.post(url, payloadJson, { headers });
            console.log('发送绘画指令结果: ', res.data);
            return false;
        }
        catch (error) {
            console.log('axios: ', error);
            throw new common_1.HttpException('绘画请求失败、当前使用人数过多、请稍后试试吧、排队中...', common_1.HttpStatus.BAD_REQUEST);
        }
    }
    async pollForResult(prompt, histroyMessageIds, randomId) {
        console.log('开始查询绘画结果轮询');
        const startTime = Date.now();
        try {
            const MAX_POLLING_COUNT = 13;
            const SHORT_INTERVAL = 12000;
            const LONG_INTERVAL = 5000;
            const TIME_THRESHOLD = 60 * 1000;
            let pollingCount = 0;
            let isLongInterval = false;
            let drawDetail = null;
            while (!drawDetail && pollingCount < MAX_POLLING_COUNT) {
                console.log(`第 ${pollingCount + 1} 次开始查询`);
                if (Date.now() - startTime >= TIME_THRESHOLD) {
                    isLongInterval = true;
                }
                await this.sleep(isLongInterval ? LONG_INTERVAL : SHORT_INTERVAL);
                const messageList = await this.queryMessageList();
                drawDetail = await this.findCurrentPromptResult(messageList, randomId, histroyMessageIds);
                pollingCount++;
            }
            if (!drawDetail) {
                throw new common_1.HttpException('绘画超时，请稍后再试！', common_1.HttpStatus.BAD_REQUEST);
            }
            const endTime = Date.now();
            console.log(`本次绘图耗时: ${Math.floor((endTime - startTime) / 1000)} S`);
            return drawDetail;
        }
        catch (err) {
            console.error(err.message);
            throw new common_1.HttpException('网络连接失败，请稍后再试！', common_1.HttpStatus.INTERNAL_SERVER_ERROR);
        }
    }
    async findCurrentPromptResult(data, randomId, histroyMessageIds) {
        if (!data || !data.length)
            return;
        console.log('本次比对的随机ID: ', randomId);
        const matchingItem = data.find((item) => {
            const { attachments = [], content, edited_timestamp } = item;
            return content.includes(randomId) && attachments.length > 0 && !edited_timestamp && !histroyMessageIds.includes(item.id);
        });
        return matchingItem || null;
    }
    async queryMessageList() {
        try {
            const { application_id, guild_id, channel_id, session_id, version, id, authorization, mjProxy } = await this.getMjDefaultParams();
            const url = mjProxy == 1
                ? `http://172.247.48.137:8000/mj/list?channel_id=${channel_id}`
                : `https://discord.com/api/v9/channels/${channel_id}/messages?limit=50`;
            const headers = { authorization };
            const response = await axios_1.default.get(url, { headers });
            return response.data;
        }
        catch (error) {
            console.log('axios get: ', error);
            throw new common_1.HttpException('查询绘制结果失败...', common_1.HttpStatus.BAD_REQUEST);
        }
    }
    async sleep(ms) {
        return new Promise((resolve) => setTimeout(resolve, ms));
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
    removeEmoji(str) {
        const regex = /[\uD800-\uDBFF][\uDC00-\uDFFF]/g;
        return str.replace(regex, '');
    }
    async checkAuth(req) {
        const m = await this.balanceEntity.findOne({ where: { userId: req.user.id } });
        const { id, balance } = m;
        if (!balance || (m === null || m === void 0 ? void 0 : m.balance) < 1) {
            throw new common_1.HttpException('您当前暂无MJ绘画余额！！！', common_1.HttpStatus.BAD_REQUEST);
        }
    }
    async checkFree(req) {
        const { id, role } = req.user;
        if (!this.freeQueueUsers[id]) {
            this.freeQueueUsers[id] = 1;
        }
        else {
            this.freeQueueUsers[id] = this.freeQueueUsers[id] + 1;
        }
        console.log(`当前用户${id}使用的次数：`, this.freeQueueUsers[id]);
    }
    async checkRateLimit(req) {
        const { id, role } = req.user;
        if (['admin', 'super'].includes(role))
            return true;
        const { mjRateLimit } = await this.getMjDefaultParams();
        if (this.rateLimits[id]) {
            const val = this.rateLimits[id];
            if (val > Date.now()) {
                console.log(`当前用户 ${id} 请求过于频繁！`);
                throw new common_1.HttpException(`由于速率限制、当前普通用户限制为${mjRateLimit}秒请求一次、请合理使用！`, common_1.HttpStatus.BAD_REQUEST);
            }
            else {
                this.rateLimits[id] = Date.now() + Number(mjRateLimit) * 1000;
            }
        }
        else {
            const timeSpace = Date.now();
            this.rateLimits[id] = timeSpace + 1000 * Number(mjRateLimit);
        }
    }
    async deductBalance(req) {
        await this.balanceEntity
            .createQueryBuilder()
            .update(balance_entity_1.BalanceEntity)
            .set({ balance: () => 'balance - 1' })
            .where('userId = :userId', { userId: req.user.id })
            .execute();
    }
    async test() {
        return 1;
    }
};
MjService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, typeorm_2.InjectRepository)(chatLog_entity_1.ChatLogEntity)),
    __param(1, (0, typeorm_2.InjectRepository)(balance_entity_1.BalanceEntity)),
    __metadata("design:paramtypes", [typeorm_1.Repository,
        typeorm_1.Repository,
        upload_service_1.UploadService,
        chatLog_service_1.ChatLogService,
        globalConfig_service_1.GlobalConfigService,
        fanyi_service_1.FanyiService,
        badwords_service_1.BadwordsService])
], MjService);
exports.MjService = MjService;
