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
exports.ChatService = void 0;
const upload_service_1 = require("../upload/upload.service");
const user_service_1 = require("../user/user.service");
const nestjs_config_1 = require("nestjs-config");
const common_1 = require("@nestjs/common");
const errorMessage_constant_1 = require("../../common/constants/errorMessage.constant");
const utils_1 = require("../../common/utils");
const axios_1 = require("axios");
const userBalance_service_1 = require("../userBalance/userBalance.service");
const chatLog_service_1 = require("../chatLog/chatLog.service");
const uuid = require("uuid");
const config_entity_1 = require("../globalConfig/config.entity");
const typeorm_1 = require("typeorm");
const typeorm_2 = require("@nestjs/typeorm");
const badwords_service_1 = require("../badwords/badwords.service");
const autoreply_service_1 = require("../autoreply/autoreply.service");
const globalConfig_service_1 = require("../globalConfig/globalConfig.service");
const app_entity_1 = require("../app/app.entity");
const chatGroup_service_1 = require("../chatGroup/chatGroup.service");
const models_service_1 = require("../models/models.service");
const store_1 = require("./store");
const chatBoxType_entity_1 = require("./chatBoxType.entity");
const chatBox_entity_1 = require("./chatBox.entity");
const chatPre_entity_1 = require("./chatPre.entity");
const chatPreType_entity_1 = require("./chatPreType.entity");
const tiktoken_1 = require("@dqbd/tiktoken");
let ChatService = class ChatService {
    constructor(configEntity, chatBoxTypeEntity, chatBoxEntity, appEntity, chatPreTypeEntity, chatPreEntity, chatLogService, configService, userBalanceService, userService, uploadService, badwordsService, autoreplyService, globalConfigService, chatGroupService, modelsService) {
        this.configEntity = configEntity;
        this.chatBoxTypeEntity = chatBoxTypeEntity;
        this.chatBoxEntity = chatBoxEntity;
        this.appEntity = appEntity;
        this.chatPreTypeEntity = chatPreTypeEntity;
        this.chatPreEntity = chatPreEntity;
        this.chatLogService = chatLogService;
        this.configService = configService;
        this.userBalanceService = userBalanceService;
        this.userService = userService;
        this.uploadService = uploadService;
        this.badwordsService = badwordsService;
        this.autoreplyService = autoreplyService;
        this.globalConfigService = globalConfigService;
        this.chatGroupService = chatGroupService;
        this.modelsService = modelsService;
        this.nineStore = null;
    }
    async onModuleInit() {
        let KeyvRedis = await (0, utils_1.importDynamic)('@keyv/redis');
        let Keyv = await (0, utils_1.importDynamic)('keyv');
        KeyvRedis = (KeyvRedis === null || KeyvRedis === void 0 ? void 0 : KeyvRedis.default) ? KeyvRedis.default : KeyvRedis;
        Keyv = (Keyv === null || Keyv === void 0 ? void 0 : Keyv.default) ? Keyv.default : Keyv;
        const port = +process.env.REDIS_PORT;
        const host = process.env.REDIS_HOST;
        const password = process.env.REDIS_PASSWORD;
        const username = process.env.REDIS_USER;
        const redisUrl = `redis://${username || ''}:${password || ''}@${host}:${port}`;
        const store = new KeyvRedis(redisUrl);
        const messageStore = new Keyv({ store, namespace: 'ai-web' });
        this.nineStore = new store_1.NineStore({ store: messageStore, namespace: 'chat' });
    }
    async chatFree(prompt, systemMessage, messagesHistory) {
        const { openaiBaseUrl, openaiBaseKey, openaiBaseModel, } = await this.globalConfigService.getConfigs([
            'openaiBaseKey',
            'openaiBaseUrl',
            'openaiBaseModel',
        ]);
        const key = openaiBaseKey;
        const proxyUrl = openaiBaseUrl;
        let requestData = [];
        if (systemMessage) {
            requestData.push({
                "role": "system",
                "content": systemMessage
            });
        }
        if (messagesHistory && messagesHistory.length > 0) {
            requestData = requestData.concat(messagesHistory);
        }
        else {
            requestData.push({
                "role": "user",
                "content": prompt
            });
        }
        const options = {
            method: 'POST',
            url: `${proxyUrl}/v1/chat/completions`,
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${key}`,
            },
            data: {
                model: openaiBaseModel || 'gpt-3.5-turbo-0125',
                messages: requestData,
            },
        };
        try {
            const response = await (0, axios_1.default)(options);
            common_1.Logger.log(`全局模型调用成功, 返回结果: ${response === null || response === void 0 ? void 0 : response.data.choices[0].message.content}`);
            return response === null || response === void 0 ? void 0 : response.data.choices[0].message.content;
        }
        catch (error) {
            console.log('error: ', error);
        }
    }
    async ttsProcess(body, req, res) {
        const { id } = req.user;
        const { chatId, prompt } = body;
        const detailKeyInfo = await this.modelsService.getCurrentModelKeyInfo('tts-1');
        const { openaiTimeout, openaiBaseUrl, openaiBaseKey, } = await this.globalConfigService.getConfigs([
            'openaiTimeout',
            'openaiBaseUrl',
            'openaiBaseKey',
        ]);
        const { key = openaiBaseKey, proxyUrl = openaiBaseUrl, deduct, deductType, timeout = openaiTimeout } = detailKeyInfo;
        await this.userBalanceService.validateBalance(req, deductType, deduct);
        console.log('开始 TTS 请求:', prompt, 'TTSService');
        const options = {
            method: 'POST',
            url: `${proxyUrl}/v1/audio/speech`,
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${key}`,
            },
            responseType: 'arraybuffer',
            timeout: timeout * 1000,
            data: {
                model: 'tts-1',
                input: prompt,
                voice: "onyx"
            },
        };
        let ttsUrl;
        try {
            const response = await (0, axios_1.default)(options);
            console.log('TTS 请求获取成功', 'TTSService');
            const buffer = Buffer.from(response.data);
            try {
                const filename = uuid.v4().slice(0, 10) + '.mp3';
                common_1.Logger.log(`------> 开始上传语音！！！`, 'TTSService');
                ttsUrl = await this.uploadService.uploadFile({ filename, buffer });
                common_1.Logger.log(`文件上传成功，URL: ${ttsUrl}`, 'TTSService');
            }
            catch (error) {
                common_1.Logger.error(`上传图片过程中出现错误: ${error}`, 'TTSService');
            }
            await this.chatLogService.updateChatLog(chatId, {
                ttsUrl: ttsUrl
            });
            await this.userBalanceService.deductFromBalance(req.user.id, deductType, deduct);
            res.status(200).send({ ttsUrl });
        }
        catch (error) {
            console.error('TTS request failed:', error);
            throw new Error('Failed to process TTS request');
        }
    }
    async chatProcess(body, req, res) {
        var _a, _b, _c, _d;
        const { options = {}, appId = null, specialModel, prompt, fileInfo, modelType, extraParam, model, drawId, customId, action, systemMessage } = body;
        const { groupId, usingNetwork } = options;
        const abortController = req.abortController;
        const { openaiTimeout, openaiBaseUrl, openaiBaseKey, systemPreMessage, isMjTranslate, mjTranslatePrompt, isDalleChat, } = await this.globalConfigService.getConfigs([
            'openaiTimeout',
            'openaiBaseUrl',
            'openaiBaseKey',
            'systemPreMessage',
            'isMjTranslate',
            'mjTranslatePrompt',
            'isDalleChat',
        ]);
        await this.userService.checkUserStatus(req.user);
        res && res.setHeader('Content-type', 'application/octet-stream; charset=utf-8');
        await this.badwordsService.checkBadWords(prompt, req.user.id);
        const autoReplyRes = await this.autoreplyService.checkAutoReply(prompt);
        if (autoReplyRes && res) {
            const msg = { message: autoReplyRes, code: 500 };
            res.write(JSON.stringify(msg));
            return res.end();
        }
        let currentRequestModelKey = null;
        let gptsName = '';
        let setSystemMessage = '';
        res && res.status(200);
        let response = null;
        const curIp = (0, utils_1.getClientIp)(req);
        let isStop = true;
        let usePrompt;
        let isSuccess = false;
        if (appId) {
            const appInfo = await this.appEntity.findOne({ where: { id: appId, status: (0, typeorm_1.In)([1, 3, 4, 5]) } });
            if (!appInfo) {
                throw new common_1.HttpException('你当前使用的应用已被下架、请删除当前对话开启新的对话吧！', common_1.HttpStatus.BAD_REQUEST);
            }
            appInfo.preset && (setSystemMessage = appInfo.preset);
            currentRequestModelKey = await this.modelsService.getCurrentModelKeyInfo(model);
            common_1.Logger.log(`使用应用预设: ${setSystemMessage}`);
        }
        else {
            if (specialModel) {
                currentRequestModelKey = await this.modelsService.getSpecialModelKeyInfo(model);
                setSystemMessage = systemMessage;
                common_1.Logger.log(`使用特殊预设: ${setSystemMessage}`);
            }
            else if (usingNetwork) {
                const netWorkPrompt = await (0, utils_1.compileNetwork)(prompt);
                const currentDate = new Date().toISOString().split('T')[0];
                setSystemMessage = netWorkPrompt + `\n Current date: ${currentDate}`;
                common_1.Logger.log(`使用联网预设: ${setSystemMessage}`);
            }
            else {
                const currentDate = new Date().toISOString().split('T')[0];
                setSystemMessage = systemPreMessage + `\n Current date: ${currentDate}`;
                currentRequestModelKey = await this.modelsService.getCurrentModelKeyInfo(model);
                common_1.Logger.log(`使用全局预设: ${setSystemMessage}`);
            }
        }
        const { deduct, isTokenBased, tokenFeeRatio, deductType, key, modelName, id: keyId, maxRounds, proxyUrl, maxModelTokens, timeout, model: useModel, isFileUpload } = currentRequestModelKey;
        if (isMjTranslate === '1' && mjTranslatePrompt && (model === 'midjourney' && action === 'IMAGINE')) {
            const translatePrompt = await this.chatFree(prompt, mjTranslatePrompt);
            usePrompt = (isFileUpload === '1' && fileInfo) ? fileInfo + " " + translatePrompt : translatePrompt;
            common_1.Logger.debug(`翻译后的用户提问: ${translatePrompt}, 最终使用的提示: ${usePrompt}`);
        }
        else {
            usePrompt = (isFileUpload === '1' && fileInfo) ? fileInfo + " " + prompt : prompt;
            common_1.Logger.debug(`未进行翻译，最终使用的提示: ${usePrompt}`);
        }
        await this.userBalanceService.validateBalance(req, deductType, deduct);
        const useModeName = gptsName || modelName;
        const proxyResUrl = proxyUrl || openaiBaseUrl || 'https://api.openai.com';
        const modelKey = key || openaiBaseKey;
        const modelTimeout = (timeout || openaiTimeout || 300) * 1000;
        common_1.Logger.log(`超时设置: ${modelTimeout / 1000} s\n` +
            `请求地址: ${proxyResUrl}\n` +
            `使用的模型名称: ${useModeName}\n` +
            `使用的模型: ${useModel}`);
        if (!currentRequestModelKey) {
            throw new common_1.HttpException('当前流程所需要的模型已被管理员下架、请联系管理员上架专属模型！', common_1.HttpStatus.BAD_REQUEST);
        }
        const groupInfo = await this.chatGroupService.getGroupInfoFromId(groupId);
        if ((groupInfo === null || groupInfo === void 0 ? void 0 : groupInfo.title) === '新对话') {
            let chatTitle;
            if (modelType === 1) {
                chatTitle = await this.chatFree(`根据用户提问{${prompt}}，给这个对话取一个名字，不超过10个字`);
            }
            else {
                chatTitle = 'AI 绘画';
            }
            await this.chatGroupService.update({
                groupId,
                title: chatTitle,
                isSticky: false,
                config: '',
            }, req);
            common_1.Logger.log(`更新标题名称为: ${chatTitle}`);
        }
        const { messagesHistory } = await this.nineStore.buildMessageFromParentMessageId(prompt, {
            groupId,
            systemMessage: setSystemMessage,
            maxModelTokens,
            maxRounds,
            fileInfo: fileInfo,
            model: useModel,
            isFileUpload,
        }, this.chatLogService);
        const userSaveLog = await this.chatLogService.saveChatLog({
            appId,
            curIp,
            userId: req.user.id,
            type: modelType,
            prompt,
            fileInfo: fileInfo,
            answer: '',
            promptTokens: 0,
            completionTokens: 0,
            totalTokens: 0,
            model: model,
            modelName: '我',
            role: 'user',
            groupId,
        });
        const assistantSaveLog = await this.chatLogService.saveChatLog({
            appId,
            curIp,
            userId: req.user.id,
            type: modelType,
            prompt: prompt,
            fileInfo: null,
            answer: '',
            progress: '0%',
            promptTokens: 0,
            completionTokens: 0,
            totalTokens: 0,
            model: model,
            modelName: useModeName,
            role: 'assistant',
            groupId,
            status: 2,
        });
        const userLogId = userSaveLog.id;
        const assistantLogId = assistantSaveLog.id;
        common_1.Logger.log('开始处理对话！');
        let charge = (action !== "UPSCALE" && useModel === 'midjourney') ? deduct * 4 : deduct;
        ;
        try {
            if (res) {
                let lastChat = null;
                res.on('close', async () => {
                    if (isSuccess) {
                        return;
                    }
                    abortController.abort();
                    const prompt_tokens = (await this.getTokenCount(prompt)) || 1;
                    const completion_tokens = (await this.getTokenCount(lastChat === null || lastChat === void 0 ? void 0 : lastChat.text)) || 1;
                    const total_tokens = prompt_tokens + completion_tokens;
                    await this.chatLogService.updateChatLog(userLogId, {
                        fileInfo: fileInfo,
                        promptTokens: prompt_tokens,
                        completionTokens: completion_tokens,
                        totalTokens: total_tokens,
                        status: 4,
                    });
                    await this.chatLogService.updateChatLog(assistantLogId, {
                        answer: lastChat === null || lastChat === void 0 ? void 0 : lastChat.text,
                        promptTokens: prompt_tokens,
                        completionTokens: completion_tokens,
                        totalTokens: total_tokens,
                        status: 4,
                    });
                    let charge = deduct;
                    if (isTokenBased === true) {
                        charge = Math.ceil((deduct * total_tokens) / tokenFeeRatio);
                    }
                    if (isStop) {
                        await this.userBalanceService.deductFromBalance(req.user.id, deductType, charge, total_tokens);
                    }
                });
                let firstChunk = true;
                try {
                    if (model === 'dall-e-3' || model === 'midjourney') {
                        if (model === 'dall-e-3') {
                            let drawPrompt;
                            drawPrompt = prompt;
                            response = this.dalleDraw(({
                                prompt: drawPrompt,
                                extraParam: extraParam,
                                apiKey: modelKey,
                                proxyUrl: proxyResUrl,
                                model,
                                timeout: modelTimeout,
                                modelName: useModeName,
                                onSuccess: async (data) => {
                                    await this.chatLogService.updateChatLog(assistantLogId, {
                                        fileInfo: data === null || data === void 0 ? void 0 : data.fileInfo,
                                        answer: (data === null || data === void 0 ? void 0 : data.answer) || prompt,
                                        progress: '100%',
                                        status: data.status,
                                    });
                                    common_1.Logger.log('绘图成功! ', 'DrawService');
                                },
                                onFailure: async (data) => {
                                    await this.chatLogService.updateChatLog(assistantLogId, {
                                        answer: '绘图失败 ... ...',
                                        status: data.status,
                                    });
                                    common_1.Logger.log('绘图失败', 'DrawService');
                                }
                            }), messagesHistory);
                        }
                        else {
                            response = await this.mjDraw({
                                usePrompt: usePrompt,
                                prompt: prompt,
                                apiKey: modelKey,
                                proxyUrl: proxyResUrl,
                                model,
                                modelName: useModeName,
                                drawId,
                                customId,
                                action,
                                timeout: modelTimeout,
                                assistantLogId,
                            });
                        }
                        await this.chatLogService.updateChatLog(assistantLogId, {
                            answer: '任务提交成功，绘制中 ... ... ',
                            status: 2
                        });
                        await this.userBalanceService.deductFromBalance(req.user.id, deductType, charge);
                        await this.modelsService.saveUseLog(keyId, 1);
                        response.text = '任务提交成功，绘制中 ... ... ';
                        response.modelName = useModeName;
                        response.model = model;
                        response.status = 2;
                        isStop = false;
                        isSuccess = true;
                        common_1.Logger.log(`用户ID: ${req.user.id} 模型名称: ${useModeName} 模型: ${model} , 消耗积分： ${charge}`, 'DrawService');
                    }
                    else {
                        response = await this.sendMessageFromAi(messagesHistory, {
                            chatId: assistantLogId,
                            maxModelTokens,
                            apiKey: modelKey,
                            model: useModel,
                            modelName: useModeName,
                            modelType,
                            prompt,
                            fileInfo,
                            isFileUpload,
                            timeout: modelTimeout,
                            proxyUrl: proxyResUrl,
                            onProgress: (chat) => {
                                res.write(firstChunk ? JSON.stringify(chat) : `\n${JSON.stringify(chat)}`);
                                lastChat = chat;
                                firstChunk = false;
                            }
                        });
                        const usage = ((_a = response.detail) === null || _a === void 0 ? void 0 : _a.usage) || { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 };
                        let { prompt_tokens, completion_tokens, total_tokens } = usage;
                        await this.chatLogService.updateChatLog(userLogId, {
                            promptTokens: prompt_tokens,
                            completionTokens: completion_tokens,
                            totalTokens: total_tokens,
                        });
                        await this.chatLogService.updateChatLog(assistantLogId, {
                            fileInfo: response === null || response === void 0 ? void 0 : response.fileInfo,
                            answer: response.text,
                            promptTokens: prompt_tokens,
                            completionTokens: completion_tokens,
                            totalTokens: total_tokens,
                            status: 3
                        });
                        if (isTokenBased === true) {
                            charge = Math.ceil((deduct * total_tokens) / tokenFeeRatio);
                        }
                        await this.userBalanceService.deductFromBalance(req.user.id, deductType, charge, total_tokens);
                        await this.modelsService.saveUseLog(keyId, total_tokens);
                        isStop = false;
                        isSuccess = true;
                        common_1.Logger.log(`用户ID: ${req.user.id} 模型名称: ${useModeName} 模型: ${model} 消耗token: ${total_tokens}, 消耗积分： ${charge}`, 'ChatService');
                    }
                }
                catch (error) {
                    common_1.Logger.error('发生错误:', error);
                    await this.chatLogService.updateChatLog(assistantLogId, {
                        status: 5,
                    });
                    response = { error: '处理请求时发生错误' };
                    isStop = false;
                }
            }
            else {
                const { messagesHistory } = await this.nineStore.buildMessageFromParentMessageId(prompt, {
                    groupId: groupId,
                    systemMessage: setSystemMessage,
                    maxRounds,
                    maxModelTokens,
                }, this.chatLogService);
                response = await this.sendMessageFromAi(messagesHistory, {
                    apiKey: modelKey,
                    model: useModel,
                    proxyUrl: proxyResUrl,
                    onProgress: null,
                    prompt,
                });
            }
            response.result && (response.result = '');
            response.is_end = true;
            const userBalance = await this.userBalanceService.queryUserBalance(req.user.id);
            response.userBalance = Object.assign({}, userBalance);
            if (res) {
                return res.write(`\n${JSON.stringify(response)}`);
            }
            else {
                return response.text;
            }
        }
        catch (error) {
            common_1.Logger.error('chat-error <----------------------------------------->', modelKey, error);
            const code = (error === null || error === void 0 ? void 0 : error.statusCode) || 400;
            const status = ((_b = error === null || error === void 0 ? void 0 : error.response) === null || _b === void 0 ? void 0 : _b.status) || (error === null || error === void 0 ? void 0 : error.statusCode) || 400;
            common_1.Logger.error('chat-error-detail  <----------------------------------------->', 'code: ', code, 'message', error === null || error === void 0 ? void 0 : error.message, 'statusText:', (_c = error === null || error === void 0 ? void 0 : error.response) === null || _c === void 0 ? void 0 : _c.statusText, 'status', (_d = error === null || error === void 0 ? void 0 : error.response) === null || _d === void 0 ? void 0 : _d.status);
            if (error.status && error.status === 402) {
                const errMsg = { message: `Catch Error ${error.message}`, code: 402 };
                if (res) {
                    return res.write(JSON.stringify(errMsg));
                }
                else {
                    throw new common_1.HttpException(error.message, common_1.HttpStatus.PAYMENT_REQUIRED);
                }
            }
            if (!status) {
                if (res) {
                    return res.write(JSON.stringify({ message: error.message, code: 500 }));
                }
                else {
                    throw new common_1.HttpException(error.message, common_1.HttpStatus.BAD_REQUEST);
                }
            }
            let message = errorMessage_constant_1.OpenAiErrorCodeMessage[status] ? errorMessage_constant_1.OpenAiErrorCodeMessage[status] : '服务异常、请重新试试吧！！！';
            if ((error === null || error === void 0 ? void 0 : error.message.includes('The OpenAI account associated with this API key has been deactivated.')) && Number(modelType) === 1) {
                await this.modelsService.lockKey(keyId, '当前模型key已被封禁、已冻结当前调用Key、尝试重新对话试试吧！', -1);
                message = '当前模型key已被封禁';
            }
            if ((error === null || error === void 0 ? void 0 : error.statusCode) === 429 && error.message.includes('billing') && Number(modelType) === 1) {
                await this.modelsService.lockKey(keyId, '当前模型key余额已耗尽、已冻结当前调用Key、尝试重新对话试试吧！', -3);
                message = '当前模型key余额已耗尽';
            }
            if ((error === null || error === void 0 ? void 0 : error.statusCode) === 429 && (error === null || error === void 0 ? void 0 : error.statusText) === 'Too Many Requests') {
                message = '当前模型调用过于频繁、请重新试试吧！';
            }
            if ((error === null || error === void 0 ? void 0 : error.statusCode) === 401 && error.message.includes('Incorrect API key provided') && Number(modelType) === 1) {
                await this.modelsService.lockKey(keyId, '提供了错误的模型秘钥', -2);
                message = '提供了错误的模型秘钥、已冻结当前调用Key、请重新尝试对话！';
            }
            if ((error === null || error === void 0 ? void 0 : error.statusCode) === 404 && error.message.includes('This is not a chat model and thus not supported') && Number(modelType) === 1) {
                await this.modelsService.lockKey(keyId, '当前模型不是聊天模型', -4);
                message = '当前模型不是聊天模型、已冻结当前调用Key、请重新尝试对话！';
            }
            if (code === 400) {
                console.log('400 error', error, error.message);
            }
            const errMsg = { message: message || 'Please check the back-end console', code: code === 401 ? 400 : code || 500 };
            if (res) {
                return res.write(JSON.stringify(errMsg));
            }
            else {
                throw new common_1.HttpException(errMsg.message, common_1.HttpStatus.BAD_REQUEST);
            }
        }
        finally {
            res && res.end();
        }
    }
    async draw(body, req) {
        var _a, _b, _c, _d;
        await this.badwordsService.checkBadWords(body.prompt, req.user.id);
        await this.userService.checkUserStatus(req.user);
        let images = [];
        const detailKeyInfo = await this.modelsService.getCurrentModelKeyInfo('dall-e-3');
        const keyId = detailKeyInfo === null || detailKeyInfo === void 0 ? void 0 : detailKeyInfo.id;
        const { key, proxyUrl, deduct, deductType, timeout } = detailKeyInfo;
        const money = (body === null || body === void 0 ? void 0 : body.quality) === 'hd' ? deduct * 2 : deduct;
        await this.userBalanceService.validateBalance(req, deductType, money);
        const { openaiTimeout, openaiBaseUrl, openaiBaseKey, } = await this.globalConfigService.getConfigs([
            'openaiTimeout',
            'openaiBaseUrl',
            'openaiBaseKey',
        ]);
        const modelKey = key || openaiBaseKey;
        const modelTimeout = (timeout || openaiTimeout || 300) * 1000;
        const proxyResUrl = proxyUrl || openaiBaseUrl || 'https://api.openai.com';
        common_1.Logger.log(`开始绘画 Prompt: ${body.prompt}`, 'DrawService');
        common_1.Logger.log(`draw paompt info <==**==> ${body.prompt}, key ===> ${key}`, 'DrawService');
        try {
            const api = `${proxyResUrl}/v1/images/generations`;
            const params = Object.assign(Object.assign({}, body), { model: 'dall-e-3' });
            console.log('dall-e draw params: ', params);
            const res = await axios_1.default.post(api, Object.assign(Object.assign({}, params), { response_format: 'b64_json' }), { headers: { Authorization: `Bearer ${modelKey}` }, timeout: modelTimeout });
            images = res.data.data;
            const task = [];
            for (const item of images) {
                const filename = `${Date.now()}-${uuid.v4().slice(0, 4)}.png`;
                const buffer = Buffer.from(item.b64_json, 'base64');
                task.push(this.uploadService.uploadFile({ filename, buffer }));
            }
            const urls = await Promise.all(task);
            await this.userBalanceService.deductFromBalance(req.user.id, 3, deduct, money);
            const curIp = (0, utils_1.getClientIp)(req);
            const taskLog = [];
            const cosType = await this.uploadService.getUploadType();
            const [width, height] = body.size.split('x');
            urls.forEach((url) => {
                taskLog.push(this.chatLogService.saveChatLog({
                    curIp,
                    userId: req.user.id,
                    type: 3,
                    prompt: body.prompt,
                    answer: url,
                    fileInfo: JSON.stringify({
                        cosType,
                        width,
                        height,
                        cosUrl: url,
                    }),
                    promptTokens: 0,
                    completionTokens: 0,
                    totalTokens: 0,
                    model: 'dall-e-3',
                }));
            });
            await Promise.all(taskLog);
            return urls;
        }
        catch (error) {
            const status = ((_a = error === null || error === void 0 ? void 0 : error.response) === null || _a === void 0 ? void 0 : _a.status) || 500;
            console.log('openai-draw error: ', JSON.stringify(error), key, status);
            const message = (_d = (_c = (_b = error === null || error === void 0 ? void 0 : error.response) === null || _b === void 0 ? void 0 : _b.data) === null || _c === void 0 ? void 0 : _c.error) === null || _d === void 0 ? void 0 : _d.message;
            if (status === 429) {
                throw new common_1.HttpException('当前请求已过载、请稍等会儿再试试吧！', common_1.HttpStatus.BAD_REQUEST);
            }
            if (status === 400 && message.includes('This request has been blocked by our content filters')) {
                throw new common_1.HttpException('您的请求已被系统拒绝。您的提示可能存在一些非法的文本。', common_1.HttpStatus.BAD_REQUEST);
            }
            if (status === 400 && message.includes('Billing hard limit has been reached')) {
                await this.modelsService.lockKey(keyId, '当前模型key已被封禁、已冻结当前调用Key、尝试重新对话试试吧！', -1);
                throw new common_1.HttpException('当前Key余额已不足、请重新再试一次吧！', common_1.HttpStatus.BAD_REQUEST);
            }
            if (status === 500) {
                throw new common_1.HttpException('绘制图片失败，请检查你的提示词是否有非法描述！', common_1.HttpStatus.BAD_REQUEST);
            }
            if (status === 401) {
                throw new common_1.HttpException('绘制图片失败，此次绘画被拒绝了！', common_1.HttpStatus.BAD_REQUEST);
            }
            throw new common_1.HttpException('绘制图片失败，请稍后试试吧！', common_1.HttpStatus.BAD_REQUEST);
        }
    }
    async setChatBoxType(req, body) {
        try {
            const { name, icon, order, id, status } = body;
            if (id) {
                return await this.chatBoxTypeEntity.update({ id }, { name, icon, order, status });
            }
            else {
                return await this.chatBoxTypeEntity.save({ name, icon, order, status });
            }
        }
        catch (error) {
            console.log('error: ', error);
        }
    }
    async delChatBoxType(req, body) {
        const { id } = body;
        if (!id) {
            throw new common_1.HttpException('非法操作！', common_1.HttpStatus.BAD_REQUEST);
        }
        const count = await this.chatBoxEntity.count({ where: { typeId: id } });
        if (count) {
            throw new common_1.HttpException('当前分类下有未处理数据不可移除！', common_1.HttpStatus.BAD_REQUEST);
        }
        return await this.chatBoxTypeEntity.delete({ id });
    }
    async queryChatBoxType() {
        return await this.chatBoxTypeEntity.find({
            order: { order: 'DESC' },
        });
    }
    async setChatBox(req, body) {
        const { title, prompt, appId, order, status, typeId, id, url } = body;
        if (!typeId) {
            throw new common_1.HttpException('缺失必要参数！', common_1.HttpStatus.BAD_REQUEST);
        }
        try {
            const params = { title, order, status, typeId, url };
            params.appId = appId || 0;
            params.prompt = prompt || '';
            if (id) {
                return await this.chatBoxEntity.update({ id }, params);
            }
            else {
                return await this.chatBoxEntity.save(params);
            }
        }
        catch (error) {
            console.log('error: ', error);
        }
    }
    async delChatBox(req, body) {
        const { id } = body;
        if (!id) {
            throw new common_1.HttpException('非法操作！', common_1.HttpStatus.BAD_REQUEST);
        }
        return await this.chatBoxEntity.delete({ id });
    }
    async queryChatBox() {
        const data = await this.chatBoxEntity.find({
            order: { order: 'DESC' },
        });
        const typeIds = [...new Set(data.map((t) => t.typeId))];
        const appIds = [...new Set(data.map((t) => t.appId))];
        const typeRes = await this.chatBoxTypeEntity.find({ where: { id: (0, typeorm_1.In)(typeIds) } });
        const appRes = await this.appEntity.find({ where: { id: (0, typeorm_1.In)(appIds) } });
        return data.map((item) => {
            const { typeId, appId } = item;
            item.typeInfo = typeRes.find((t) => t.id === typeId);
            item.appInfo = appRes.find((t) => t.id === appId);
            return item;
        });
    }
    async queryChatBoxFrontend() {
        const typeRes = await this.chatBoxTypeEntity.find({ order: { order: 'DESC' }, where: { status: true } });
        const boxinfos = await this.chatBoxEntity.find({ where: { status: true } });
        const appIds = [...new Set(boxinfos.map((t) => t.appId))];
        const appInfos = await this.appEntity.find({ where: { id: (0, typeorm_1.In)(appIds) } });
        boxinfos.forEach((item) => {
            const app = appInfos.find((k) => k.id === item.appId);
            item.coverImg = app === null || app === void 0 ? void 0 : app.coverImg;
            return item;
        });
        return typeRes.map((t) => {
            t.childList = boxinfos.filter((box) => box.typeId === t.id && box.status);
            return t;
        });
    }
    async setChatPreType(req, body) {
        try {
            const { name, icon, order, id, status } = body;
            if (id) {
                return await this.chatPreTypeEntity.update({ id }, { name, icon, order, status });
            }
            else {
                return await this.chatPreTypeEntity.save({ name, icon, order, status });
            }
        }
        catch (error) {
            console.log('error: ', error);
        }
    }
    async delChatPreType(req, body) {
        const { id } = body;
        if (!id) {
            throw new common_1.HttpException('非法操作！', common_1.HttpStatus.BAD_REQUEST);
        }
        const count = await this.chatBoxEntity.count({ where: { typeId: id } });
        if (count) {
            throw new common_1.HttpException('当前分类下有未处理数据不可移除！', common_1.HttpStatus.BAD_REQUEST);
        }
        return await this.chatPreTypeEntity.delete({ id });
    }
    async queryChatPreType() {
        return await this.chatPreTypeEntity.find({
            order: { order: 'DESC' },
        });
    }
    async setChatPre(req, body) {
        const { title, prompt, appId, order, status, typeId, id, url } = body;
        if (!typeId) {
            throw new common_1.HttpException('缺失必要参数！', common_1.HttpStatus.BAD_REQUEST);
        }
        try {
            const params = { title, prompt, order, status, typeId, url };
            if (id) {
                return await this.chatPreEntity.update({ id }, params);
            }
            else {
                return await this.chatPreEntity.save(params);
            }
        }
        catch (error) {
            console.log('error: ', error);
        }
    }
    async delChatPre(req, body) {
        const { id } = body;
        if (!id) {
            throw new common_1.HttpException('非法操作！', common_1.HttpStatus.BAD_REQUEST);
        }
        return await this.chatPreEntity.delete({ id });
    }
    async queryChatPre() {
        const data = await this.chatPreEntity.find({
            order: { order: 'DESC' },
        });
        const typeIds = [...new Set(data.map((t) => t.typeId))];
        const typeRes = await this.chatPreTypeEntity.find({ where: { id: (0, typeorm_1.In)(typeIds) } });
        return data.map((item) => {
            const { typeId, appId } = item;
            item.typeInfo = typeRes.find((t) => t.id === typeId);
            return item;
        });
    }
    async queryChatPreList() {
        const typeRes = await this.chatPreTypeEntity.find({ order: { order: 'DESC' }, where: { status: true } });
        const chatPreData = await this.chatPreEntity.find({ where: { status: true } });
        return typeRes.map((t) => {
            t.childList = chatPreData.filter((box) => box.typeId === t.id && box.status);
            return t;
        });
    }
    async sendMessageFromAi(messagesHistory, inputs) {
        const { onProgress, apiKey, model, proxyUrl, modelName, timeout, chatId, isFileUpload } = inputs;
        let result = { text: '', model: '', modelName: modelName, chatId: chatId };
        const options = {
            method: 'POST',
            url: `${proxyUrl}/v1/chat/completions`,
            responseType: "stream",
            timeout: timeout,
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${apiKey}`,
            },
            data: {
                stream: true,
                model,
                messages: messagesHistory,
            },
        };
        if (isFileUpload === 2) {
            options.data.max_tokens = 2048;
        }
        return new Promise(async (resolve, reject) => {
            try {
                const response = await (0, axios_1.default)(options);
                const stream = response.data;
                stream.on('data', (chunk) => {
                    var _a;
                    const splitArr = chunk.toString().split('\n\n').filter((line) => line.trim() !== '');
                    for (const line of splitArr) {
                        const data = line.replace('data:', '');
                        let ISEND = false;
                        try {
                            ISEND = JSON.parse(data).choices[0].finish_reason === 'stop';
                        }
                        catch (error) {
                            ISEND = false;
                        }
                        if (ISEND) {
                            result.text = result.text.trim();
                            return result;
                        }
                        try {
                            if (data !== " [DONE]" && data !== "[DONE]" && data != "[DONE] ") {
                                const parsedData = JSON.parse(data);
                                if (parsedData.id) {
                                    result.id = parsedData.id;
                                }
                                if ((_a = parsedData.choices) === null || _a === void 0 ? void 0 : _a.length) {
                                    const delta = parsedData.choices[0].delta;
                                    result.delta = delta.content;
                                    if (delta === null || delta === void 0 ? void 0 : delta.content)
                                        result.text += delta.content;
                                    if (delta.role) {
                                        result.role = delta.role;
                                    }
                                    result.detail = parsedData;
                                }
                                onProgress && onProgress({ text: result.text });
                            }
                        }
                        catch (error) {
                            console.log('parse Error', data);
                        }
                    }
                });
                let totalText = '';
                messagesHistory.forEach(messagesHistory => {
                    totalText += messagesHistory.content + ' ';
                });
                stream.on('end', async () => {
                    if (result.detail && result.text) {
                        const promptTokens = this.getTokenCount(totalText);
                        const completionTokens = this.getTokenCount(result.text);
                        result.detail.usage = {
                            prompt_tokens: await promptTokens,
                            completion_tokens: await completionTokens,
                            total_tokens: await promptTokens + await completionTokens,
                            estimated: true
                        };
                    }
                    return resolve(result);
                });
            }
            catch (error) {
                reject(error);
            }
        });
    }
    async dalleDraw(inputs, messagesHistory) {
        var _a, _b, _c, _d;
        common_1.Logger.log('开始提交 Dalle 绘图任务 ', 'DrawService');
        const { apiKey, model, proxyUrl, prompt, extraParam, timeout, onSuccess, onFailure } = inputs;
        const size = (extraParam === null || extraParam === void 0 ? void 0 : extraParam.size) || '1024x1024';
        let result = { answer: '', fileInfo: '', status: 2 };
        try {
            const options = {
                method: 'POST',
                url: `${proxyUrl}/v1/images/generations`,
                timeout: timeout,
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${apiKey}`,
                },
                data: {
                    model: model,
                    prompt: prompt,
                    size,
                    response_format: 'b64_json'
                },
            };
            const response = await (0, axios_1.default)(options);
            common_1.Logger.debug(`请求状态${JSON.stringify(response.status)}`);
            const buffer = Buffer.from(response.data.data[0].b64_json, 'base64');
            try {
                const filename = `${Date.now()}-${uuid.v4().slice(0, 4)}.png`;
                common_1.Logger.debug(`------> 开始上传图片！！！`, 'DrawService');
                result.fileInfo = await this.uploadService.uploadFile({ filename, buffer });
                common_1.Logger.debug(`图片上传成功，URL: ${result.fileInfo}`, 'DrawService');
            }
            catch (error) {
                common_1.Logger.error(`上传图片过程中出现错误: ${error}`, 'DrawService');
            }
            let revised_prompt_cn;
            try {
                revised_prompt_cn = await this.chatFree(`根据提示词{${response.data.data[0].revised_prompt}}, 模拟AI绘画机器人的语气，用中文回复，告诉用户已经画好了`);
            }
            catch (error) {
                revised_prompt_cn = `${prompt} 绘制成功`;
                common_1.Logger.error("翻译失败: ", error);
            }
            result.answer = revised_prompt_cn;
            result.status = 3;
            onSuccess(result);
            return;
        }
        catch (error) {
            result.status = 5;
            onFailure(result);
            const status = ((_a = error === null || error === void 0 ? void 0 : error.response) === null || _a === void 0 ? void 0 : _a.status) || 500;
            console.log('draw error: ', JSON.stringify(error), status);
            const message = (_d = (_c = (_b = error === null || error === void 0 ? void 0 : error.response) === null || _b === void 0 ? void 0 : _b.data) === null || _c === void 0 ? void 0 : _c.error) === null || _d === void 0 ? void 0 : _d.message;
            if (status === 429) {
                result.text = '当前请求已过载、请稍等会儿再试试吧！';
                return result;
            }
            if (status === 400 && message.includes('This request has been blocked by our content filters')) {
                result.text = '您的请求已被系统拒绝。您的提示可能存在一些非法的文本。';
                return result;
            }
            if (status === 400 && message.includes('Billing hard limit has been reached')) {
                result.text = '当前模型key已被封禁、已冻结当前调用Key、尝试重新对话试试吧！';
                return result;
            }
            if (status === 500) {
                result.text = '绘制图片失败，请检查你的提示词是否有非法描述！';
                return result;
            }
            if (status === 401) {
                result.text = '绘制图片失败，此次绘画被拒绝了！';
                return result;
            }
            result.text = '绘制图片失败，请稍后试试吧！';
            return result;
        }
    }
    async getTokenCount(text) {
        if (!text)
            return 0;
        if (typeof text !== 'string') {
            text = String(text);
        }
        text = text.replace(/<\|endoftext\|>/g, '');
        const tokenizer = (0, tiktoken_1.get_encoding)('cl100k_base');
        return tokenizer.encode(text).length;
    }
    async mjDraw(inputs) {
        var _a, _b;
        const { id, apiKey, proxyUrl, action, drawId, prompt, usePrompt, customId, timeout, assistantLogId } = inputs;
        let result = { text: '', fileInfo: '', drawId: '', customId: '', status: 2 };
        let response;
        let retryCount = 0;
        let url = '';
        while (retryCount < 3) {
            let payloadJson = {};
            try {
                if (action === 'IMAGINE') {
                    url = `${proxyUrl}/mj/submit/imagine`;
                    payloadJson = { prompt: usePrompt };
                }
                else {
                    url = `${proxyUrl}/mj/submit/action`;
                    payloadJson = { taskId: drawId, customId: customId };
                }
                const headers = { "mj-api-secret": apiKey };
                common_1.Logger.debug(`正在准备发送请求到 ${url}，payload: ${JSON.stringify(payloadJson)}, headers: ${JSON.stringify(headers)}`);
                response = await axios_1.default.post(url, payloadJson, { headers });
                common_1.Logger.debug(`任务提交结果，状态码: ${response.status}, 状态消息: ${response.statusText}, 数据: ${JSON.stringify(response.data)}`);
                if ((_a = response === null || response === void 0 ? void 0 : response.data) === null || _a === void 0 ? void 0 : _a.result) {
                    result.drawId = (_b = response === null || response === void 0 ? void 0 : response.data) === null || _b === void 0 ? void 0 : _b.result;
                    break;
                }
                else {
                    throw new Error('未能获取结果数据, 即将重试');
                }
            }
            catch (error) {
                retryCount++;
                if (retryCount >= 3) {
                    common_1.Logger.log(`绘画任务提交失败, 请检查后台配置或者稍后重试! ${error}`, 'MidjourneyService');
                }
            }
        }
        this.pollMjDrawingResult({
            proxyUrl,
            apiKey,
            drawId: response.data.result,
            timeout,
            prompt,
            onSuccess: async (data) => {
                await this.chatLogService.updateChatLog(assistantLogId, {
                    fileInfo: data === null || data === void 0 ? void 0 : data.fileInfo,
                    answer: (data === null || data === void 0 ? void 0 : data.answer) || prompt,
                    progress: '100%',
                    status: 3,
                    drawId: data === null || data === void 0 ? void 0 : data.drawId,
                    customId: data === null || data === void 0 ? void 0 : data.customId,
                });
                common_1.Logger.log('绘图成功！');
            },
            onDrawing: async (data) => {
                await this.chatLogService.updateChatLog(assistantLogId, {
                    answer: (data === null || data === void 0 ? void 0 : data.answer) || '绘制中 ... ...',
                    progress: data === null || data === void 0 ? void 0 : data.progress,
                    status: 2,
                });
                common_1.Logger.log(`绘制中！绘制进度${data === null || data === void 0 ? void 0 : data.progress}`);
            },
            onFailure: async (data) => {
                await this.chatLogService.updateChatLog(assistantLogId, {
                    answer: '绘图失败 ... ...',
                    status: data.status,
                });
                common_1.Logger.log('绘图失败');
            }
        }).catch(error => {
            common_1.Logger.error("查询绘图结果时发生错误:", error, 'MidjourneyService');
        });
        common_1.Logger.log(`绘画任务提交成功, 绘画ID: ${response.data.result}`, 'MidjourneyService');
        return result;
    }
    async pollMjDrawingResult(inputs) {
        const { proxyUrl, apiKey, drawId, timeout, onSuccess, prompt, onFailure, onDrawing } = inputs;
        const { mjNotSaveImg = 1, mjProxyImgUrl = '', mjNotUseProxy = 1, } = await this.globalConfigService.getConfigs([
            'mjNotSaveImg',
            'mjProxyImgUrl',
            'mjNotUseProxy',
        ]);
        let response;
        let result = { fileInfo: '', drawId: '', customId: '', status: 2, progress: 0, answer: '' };
        let payloadJson = {};
        const startTime = Date.now();
        const POLL_INTERVAL = 5000;
        let retryCount = 0;
        let pollingCount = 0;
        try {
            while (Date.now() - startTime < timeout) {
                await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL));
                try {
                    const headers = {
                        "Content-Type": "application/x-www-form-urlencoded",
                        "mj-api-secret": apiKey
                    };
                    const url = `${proxyUrl}/mj/task/${drawId}/fetch`;
                    const res = await axios_1.default.get(url, { headers });
                    const responses = res.data;
                    let cosUrl;
                    if (responses.status === 'SUCCESS') {
                        common_1.Logger.log(`绘制成功, 获取到的URL: ${responses.imageUrl}`, 'MidjourneyService');
                        const shouldUseProxy = mjNotSaveImg === '1' && mjNotUseProxy === '0';
                        const shouldUseOriginalUrl = mjNotSaveImg === '1' && mjNotUseProxy === '1';
                        let logMessage = '';
                        if (shouldUseProxy) {
                            const newUrlBase = new URL(mjProxyImgUrl);
                            const parsedUrl = new URL(responses.imageUrl);
                            parsedUrl.protocol = newUrlBase.protocol;
                            parsedUrl.hostname = newUrlBase.hostname;
                            cosUrl = parsedUrl.toString();
                            logMessage = `使用代理替换后的 URL: ${cosUrl}`;
                        }
                        else if (shouldUseOriginalUrl) {
                            cosUrl = responses.imageUrl;
                            logMessage = `使用原始图片链接 ${cosUrl}`;
                        }
                        else {
                            try {
                                common_1.Logger.debug(`------> 开始上传图片！！！`);
                                const filename = `${Date.now()}-${uuid.v4().slice(0, 4)}.png`;
                                cosUrl = await this.uploadService.uploadFileFromUrl({ filename, url: responses.imageUrl });
                                logMessage = `上传成功 URL: ${cosUrl}`;
                            }
                            catch (uploadError) {
                                common_1.Logger.error('存储图片失败，使用原始图片链接');
                                cosUrl = responses.imageUrl;
                                logMessage = `存储图片失败，使用原始图片链接 ${cosUrl}`;
                            }
                        }
                        common_1.Logger.log(logMessage, 'MidjourneyService');
                        result.fileInfo = cosUrl;
                        result.drawId = responses.id;
                        result.customId = JSON.stringify(responses.buttons);
                        result.answer = `${prompt}\n${responses.finalPrompt || responses.properties.finalPrompt || ''}`;
                        onSuccess(result);
                        return;
                    }
                    result.progress = responses === null || responses === void 0 ? void 0 : responses.progress;
                    result.answer = `当前绘制进度 ${responses === null || responses === void 0 ? void 0 : responses.progress}`;
                    if (result.progress) {
                        onDrawing(result);
                    }
                }
                catch (error) {
                    retryCount++;
                    common_1.Logger.error(`轮询过程中发生错误: ${error}`, 'MidjourneyService');
                }
            }
            common_1.Logger.error(`超过 ${startTime / 1000} s 未完成绘画, 请稍后再试! MidjourneyService`);
            result.status = 4;
            onFailure(result);
            throw new common_1.HttpException('绘画超时，请稍后再试！', common_1.HttpStatus.BAD_REQUEST);
        }
        catch (error) {
            common_1.Logger.error(`绘画失败: ${error} MidjourneyService`);
            result.status = 5;
            onFailure(result);
        }
    }
};
ChatService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, typeorm_2.InjectRepository)(config_entity_1.ConfigEntity)),
    __param(1, (0, typeorm_2.InjectRepository)(chatBoxType_entity_1.ChatBoxTypeEntity)),
    __param(2, (0, typeorm_2.InjectRepository)(chatBox_entity_1.ChatBoxEntity)),
    __param(3, (0, typeorm_2.InjectRepository)(app_entity_1.AppEntity)),
    __param(4, (0, typeorm_2.InjectRepository)(chatPreType_entity_1.ChatPreTypeEntity)),
    __param(5, (0, typeorm_2.InjectRepository)(chatPre_entity_1.ChatPreEntity)),
    __metadata("design:paramtypes", [typeorm_1.Repository,
        typeorm_1.Repository,
        typeorm_1.Repository,
        typeorm_1.Repository,
        typeorm_1.Repository,
        typeorm_1.Repository,
        chatLog_service_1.ChatLogService,
        nestjs_config_1.ConfigService,
        userBalance_service_1.UserBalanceService,
        user_service_1.UserService,
        upload_service_1.UploadService,
        badwords_service_1.BadwordsService,
        autoreply_service_1.AutoreplyService,
        globalConfig_service_1.GlobalConfigService,
        chatGroup_service_1.ChatGroupService,
        models_service_1.ModelsService])
], ChatService);
exports.ChatService = ChatService;
