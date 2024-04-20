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
const common_1 = require("@nestjs/common");
const nestjs_config_1 = require("nestjs-config");
const upload_service_1 = require("../upload/upload.service");
const user_service_1 = require("../user/user.service");
const errorMessage_constant_1 = require("../../common/constants/errorMessage.constant");
const utils_1 = require("../../common/utils");
const typeorm_1 = require("@nestjs/typeorm");
const axios_1 = require("axios");
const typeorm_2 = require("typeorm");
const uuid = require("uuid");
const autoreply_service_1 = require("../autoreply/autoreply.service");
const badwords_service_1 = require("../badwords/badwords.service");
const chatLog_service_1 = require("../chatLog/chatLog.service");
const config_entity_1 = require("../globalConfig/config.entity");
const globalConfig_service_1 = require("../globalConfig/globalConfig.service");
const userBalance_service_1 = require("../userBalance/userBalance.service");
const apiDataService_service_1 = require("./apiDataService.service");
const tiktoken_1 = require("@dqbd/tiktoken");
const app_entity_1 = require("../app/app.entity");
const chatGroup_service_1 = require("../chatGroup/chatGroup.service");
const models_service_1 = require("../models/models.service");
const chatBox_entity_1 = require("./chatBox.entity");
const chatBoxType_entity_1 = require("./chatBoxType.entity");
const chatPre_entity_1 = require("./chatPre.entity");
const chatPreType_entity_1 = require("./chatPreType.entity");
const store_1 = require("./store");
let ChatService = class ChatService {
    constructor(configEntity, chatBoxTypeEntity, chatBoxEntity, appEntity, chatPreTypeEntity, chatPreEntity, apiDataService, chatLogService, configService, userBalanceService, userService, uploadService, badwordsService, autoreplyService, globalConfigService, chatGroupService, modelsService) {
        this.configEntity = configEntity;
        this.chatBoxTypeEntity = chatBoxTypeEntity;
        this.chatBoxEntity = chatBoxEntity;
        this.appEntity = appEntity;
        this.chatPreTypeEntity = chatPreTypeEntity;
        this.chatPreEntity = chatPreEntity;
        this.apiDataService = apiDataService;
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
    async ttsProcess(body, req, res) {
        const { id } = req.user;
        const { chatId, prompt } = body;
        const detailKeyInfo = await this.modelsService.getCurrentModelKeyInfo('tts-1');
        const { openaiTimeout, openaiBaseUrl, openaiBaseKey, } = await this.globalConfigService.getConfigs([
            'openaiTimeout',
            'openaiBaseUrl',
            'openaiBaseKey',
        ]);
        const { key, proxyUrl, deduct, deductType, timeout } = detailKeyInfo;
        let useKey = key || openaiBaseKey;
        let useUrl = proxyUrl || openaiBaseUrl;
        let useTimeout = (timeout || openaiTimeout) * 1000;
        await this.userBalanceService.validateBalance(req, deductType, deduct);
        console.log('开始 TTS 请求:', prompt, 'TTSService');
        const options = {
            method: 'POST',
            url: `${useUrl}/v1/audio/speech`,
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${useKey}`,
            },
            responseType: 'arraybuffer',
            timeout: useTimeout,
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
        var _a, _b, _c;
        const { options = {}, appId = null, specialModel, prompt, fileInfo, modelType, extraParam, model, drawId, customId, action } = body;
        let appInfo;
        if (specialModel) {
            appInfo = await this.appEntity.findOne({ where: { des: specialModel, isSystemReserved: true } });
        }
        else if (appId) {
            appInfo = await this.appEntity.findOne({ where: { id: appId, status: (0, typeorm_2.In)([1, 3, 4, 5]) } });
            if (!appInfo) {
                throw new common_1.HttpException('你当前使用的应用已被下架、请删除当前对话开启新的对话吧！', common_1.HttpStatus.BAD_REQUEST);
            }
        }
        const { groupId, usingNetwork, fileParsing, usingMindMap } = options;
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
        let currentRequestModelKey = null;
        let appName = '';
        let setSystemMessage = '';
        res && res.status(200);
        let response = null;
        const curIp = (0, utils_1.getClientIp)(req);
        let isStop = true;
        let usePrompt;
        let isSuccess = false;
        if (appInfo) {
            const { isGPTs, gizmoID, name, isFixedModel, appModel } = appInfo;
            appName = name;
            if (isGPTs) {
                currentRequestModelKey = await this.modelsService.getCurrentModelKeyInfo('gpts');
                await this.chatLogService.checkModelLimits(req.user, 'gpts');
                currentRequestModelKey.model = `gpt-4-gizmo-${gizmoID}`;
            }
            else if (!isGPTs && isFixedModel && appModel) {
                appInfo.preset && (setSystemMessage = appInfo.preset);
                currentRequestModelKey = await this.modelsService.getCurrentModelKeyInfo(appModel);
                await this.chatLogService.checkModelLimits(req.user, appModel);
                currentRequestModelKey.model = appModel;
                if (fileParsing) {
                    setSystemMessage = `${setSystemMessage}以下是我提供给你的知识库：【${fileParsing}】，在回答问题之前，先检索知识库内有没有相关的内容，尽量使用知识库中获取到的信息来回答我的问题，以知识库中的为准。`;
                }
                common_1.Logger.log(`固定模型、使用应用预设: ${setSystemMessage}`);
            }
            else {
                appInfo.preset && (setSystemMessage = appInfo.preset);
                currentRequestModelKey = await this.modelsService.getCurrentModelKeyInfo(model);
                await this.chatLogService.checkModelLimits(req.user, model);
                if (fileParsing) {
                    setSystemMessage = `${setSystemMessage}以下是我提供给你的知识库：【${fileParsing}】，在回答问题之前，先检索知识库内有没有相关的内容，尽量使用知识库中获取到的信息来回答我的问题，以知识库中的为准。`;
                }
                common_1.Logger.log(`使用应用预设: ${setSystemMessage}`);
            }
        }
        else {
            const currentDate = new Date().toISOString().split('T')[0];
            setSystemMessage = systemPreMessage + `\n Current date: ${currentDate}`;
            currentRequestModelKey = await this.modelsService.getCurrentModelKeyInfo(model);
            await this.chatLogService.checkModelLimits(req.user, model);
            common_1.Logger.log(`使用全局预设: ${setSystemMessage}`);
        }
        const { deduct, isTokenBased, tokenFeeRatio, deductType, key, modelName, id: keyId, maxRounds, proxyUrl, maxModelTokens, timeout, model: useModel, isFileUpload } = currentRequestModelKey;
        if (isMjTranslate === '1' && mjTranslatePrompt && model === 'midjourney') {
            const translatePrompt = await this.apiDataService.chatFree(prompt, mjTranslatePrompt);
            usePrompt = (isFileUpload === '1' && fileInfo) ? fileInfo + " " + translatePrompt : translatePrompt;
        }
        else {
            usePrompt = (isFileUpload === '1' && fileInfo) ? fileInfo + " " + prompt : prompt;
        }
        await this.userBalanceService.validateBalance(req, deductType, deduct);
        const useModeName = appName || modelName;
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
        let groupInfo;
        if (groupId) {
            groupInfo = await this.chatGroupService.getGroupInfoFromId(groupId);
        }
        if ((groupInfo === null || groupInfo === void 0 ? void 0 : groupInfo.title) === '新对话') {
            let chatTitle;
            if (modelType === 1) {
                chatTitle = await this.apiDataService.chatFree(`根据用户提问{${prompt}}，给这个对话取一个名字，不超过10个字`);
            }
            else {
                chatTitle = '创意 AI';
            }
            await this.chatGroupService.update({
                groupId,
                title: chatTitle,
                isSticky: false,
                config: '',
            }, req);
            common_1.Logger.log(`更新标题名称为: ${chatTitle}`);
        }
        if (groupId) {
            await this.chatGroupService.updateTime(groupId);
        }
        const { messagesHistory } = await this.nineStore.buildMessageFromParentMessageId(prompt, {
            groupId,
            systemMessage: setSystemMessage,
            maxModelTokens,
            maxRounds: usingNetwork || useModel.includes('suno') ? 0 : maxRounds,
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
            model: useModel,
            modelName: '我',
            role: 'user',
            groupId,
        });
        const pluginsUsed = JSON.stringify({
            usingNetwork: !!usingNetwork,
            usingMindMap: !!usingMindMap,
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
            model: useModel,
            modelName: useModeName,
            role: 'assistant',
            groupId,
            status: 2,
            pluginParam: pluginsUsed,
        });
        const userLogId = userSaveLog.id;
        const assistantLogId = assistantSaveLog.id;
        const autoReplyRes = await this.autoreplyService.checkAutoReply(prompt);
        if (autoReplyRes && res) {
            const msg = { text: autoReplyRes };
            const chars = autoReplyRes.split('');
            const sendCharByChar = (index) => {
                if (index < chars.length) {
                    const msg = { text: chars[index] };
                    res.write(`${JSON.stringify(msg)}\n`);
                    setTimeout(() => sendCharByChar(index + 1), 20);
                }
                else {
                    res.end();
                }
            };
            sendCharByChar(0);
            await this.chatLogService.updateChatLog(assistantLogId, {
                answer: autoReplyRes,
            });
            return;
        }
        common_1.Logger.log('开始处理对话！');
        let charge = (action !== "UPSCALE" && useModel === 'midjourney') ? deduct * 4 : deduct;
        ;
        let isClientClosed = false;
        try {
            if (res) {
                let lastChat;
                res.on('close', async () => {
                    if (isSuccess) {
                        return;
                    }
                    isClientClosed = true;
                    const prompt_tokens = (await this.getTokenCount(prompt)) || 1;
                    const completion_tokens = (await this.getTokenCount(lastChat === null || lastChat === void 0 ? void 0 : lastChat.answer)) || 1;
                    const total_tokens = prompt_tokens + completion_tokens;
                    await this.chatLogService.updateChatLog(userLogId, {
                        fileInfo: fileInfo,
                        promptTokens: prompt_tokens,
                        completionTokens: completion_tokens,
                        totalTokens: total_tokens,
                        status: 4,
                    });
                    await this.chatLogService.updateChatLog(assistantLogId, {
                        answer: lastChat === null || lastChat === void 0 ? void 0 : lastChat.answer,
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
                let response;
                let firstChunk = true;
                try {
                    if (useModel === 'dall-e-3' || useModel === 'midjourney' || useModel.includes('suno') || useModel.includes('stable-diffusion')) {
                        if (useModel === 'dall-e-3') {
                            let drawPrompt;
                            if (isDalleChat === '1') {
                                try {
                                    common_1.Logger.log('已开启连续绘画模式');
                                    const { messagesHistory } = await this.nineStore.buildMessageFromParentMessageId(`${prompt},不用包含任何礼貌性的寒暄,只需要场景的描述,可以适当联想`, {
                                        groupId,
                                        systemMessage: "总结我的绘画需求,然后生成绘画场景的描述",
                                        maxModelTokens,
                                        maxRounds,
                                        fileInfo: fileInfo,
                                        model: useModel,
                                        isFileUpload,
                                    }, this.chatLogService);
                                    drawPrompt = await this.apiDataService.chatFree(prompt, undefined, messagesHistory);
                                }
                                catch (error) {
                                    console.error("调用chatFree失败：", error);
                                    drawPrompt = prompt;
                                }
                            }
                            else {
                                drawPrompt = prompt;
                            }
                            response = this.apiDataService.dalleDraw(({
                                prompt: drawPrompt,
                                extraParam: extraParam,
                                apiKey: modelKey,
                                proxyUrl: proxyResUrl,
                                model: useModel,
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
                                        answer: '绘图失败',
                                        status: data.status,
                                    });
                                    common_1.Logger.log('绘图失败', 'DrawService');
                                }
                            }), messagesHistory);
                            await this.chatLogService.updateChatLog(assistantLogId, {
                                answer: '绘制中',
                            });
                        }
                        else if (useModel.includes('suno')) {
                            response = this.suno(messagesHistory, {
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
                                onGenerate: async (data) => {
                                    await this.chatLogService.updateChatLog(assistantLogId, {
                                        fileInfo: data === null || data === void 0 ? void 0 : data.fileInfo,
                                        answer: (data === null || data === void 0 ? void 0 : data.answer) || prompt,
                                        status: 2,
                                    });
                                    common_1.Logger.log('歌曲生成中');
                                },
                                onSuccess: async (data) => {
                                    await this.chatLogService.updateChatLog(assistantLogId, {
                                        fileInfo: data === null || data === void 0 ? void 0 : data.fileInfo,
                                        answer: (data === null || data === void 0 ? void 0 : data.answer) || prompt,
                                        progress: '100%',
                                        status: 3,
                                    });
                                    common_1.Logger.log('生成歌曲成功');
                                },
                                onFailure: async (data) => {
                                    await this.chatLogService.updateChatLog(assistantLogId, {
                                        answer: data.errMsg,
                                        status: 4,
                                    });
                                }
                            });
                            await this.chatLogService.updateChatLog(assistantLogId, {
                                answer: '提交成功，歌曲生成中',
                            });
                        }
                        else if (useModel.includes('stable-diffusion')) {
                            response = this.sdxl(messagesHistory, {
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
                                onSuccess: async (data) => {
                                    await this.chatLogService.updateChatLog(assistantLogId, {
                                        fileInfo: data === null || data === void 0 ? void 0 : data.fileInfo,
                                        answer: (data === null || data === void 0 ? void 0 : data.answer) || prompt,
                                        progress: '100%',
                                        status: 3,
                                    });
                                },
                                onFailure: async (data) => {
                                    await this.chatLogService.updateChatLog(assistantLogId, {
                                        answer: '生成失败',
                                        status: 4,
                                    });
                                }
                            });
                            await this.chatLogService.updateChatLog(assistantLogId, {
                                answer: '绘制中',
                            });
                        }
                        else {
                            response = this.mjDraw({
                                usePrompt: usePrompt,
                                prompt: prompt,
                                apiKey: modelKey,
                                proxyUrl: proxyResUrl,
                                model: useModel,
                                modelName: useModeName,
                                drawId,
                                customId,
                                action,
                                timeout: modelTimeout,
                                assistantLogId,
                            });
                            await this.chatLogService.updateChatLog(assistantLogId, {
                                answer: '绘制中',
                            });
                        }
                        await this.modelsService.saveUseLog(keyId, 1);
                        await this.userBalanceService.deductFromBalance(req.user.id, deductType, charge);
                        const userBalance = await this.userBalanceService.queryUserBalance(req.user.id);
                        response.userBalance = Object.assign({}, userBalance);
                        response.text = '提交成功';
                        isStop = false;
                        isSuccess = true;
                        response.status = 2;
                        response.model = model;
                        response.modelName = modelName;
                        return res.write(`\n${JSON.stringify(response)}`);
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
                            },
                            onFailure: async (data) => {
                                await this.chatLogService.updateChatLog(assistantLogId, {
                                    answer: data.errMsg,
                                    status: 4,
                                });
                            }
                        }, isClientClosed);
                        if (response.errMsg) {
                            isStop = false;
                            isSuccess = true;
                            common_1.Logger.error(`用户ID: ${req.user.id} 模型名称: ${useModeName} 模型: ${model} 回复出错，本次不扣除积分`, 'ChatService');
                            return res.write(`\n${JSON.stringify(response)}`);
                        }
                        let totalText = '';
                        messagesHistory.forEach(messagesHistory => {
                            totalText += messagesHistory.content + ' ';
                        });
                        const promptTokens = await this.getTokenCount(totalText);
                        const completionTokens = await this.getTokenCount(response.answer);
                        await this.chatLogService.updateChatLog(userLogId, {
                            promptTokens: promptTokens,
                            completionTokens: completionTokens,
                            totalTokens: promptTokens + completionTokens,
                        });
                        await this.chatLogService.updateChatLog(assistantLogId, {
                            fileInfo: response === null || response === void 0 ? void 0 : response.fileInfo,
                            answer: response.answer,
                            promptTokens: promptTokens,
                            completionTokens: completionTokens,
                            totalTokens: promptTokens + completionTokens,
                            status: 3
                        });
                        if (isTokenBased === true) {
                            charge = Math.ceil((deduct * (promptTokens + completionTokens)) / tokenFeeRatio);
                        }
                        await this.userBalanceService.deductFromBalance(req.user.id, deductType, charge, (promptTokens + completionTokens));
                        await this.modelsService.saveUseLog(keyId, (promptTokens + completionTokens));
                        common_1.Logger.log(`用户ID: ${req.user.id} 模型名称: ${useModeName} 模型: ${model} 消耗token: ${(promptTokens + completionTokens)}, 消耗积分： ${charge}`, 'ChatService');
                        const userBalance = await this.userBalanceService.queryUserBalance(req.user.id);
                        response.userBalance = Object.assign({}, userBalance);
                        isStop = false;
                        isSuccess = true;
                        return res.write(`\n${JSON.stringify(response)}`);
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
                }, isClientClosed);
                await this.userBalanceService.deductFromBalance(req.user.id, deductType, charge);
                return response.answer;
            }
        }
        catch (error) {
            common_1.Logger.error('chat-error <----------------------------------------->', modelKey, error);
            const code = (error === null || error === void 0 ? void 0 : error.statusCode) || 400;
            const status = ((_a = error === null || error === void 0 ? void 0 : error.response) === null || _a === void 0 ? void 0 : _a.status) || (error === null || error === void 0 ? void 0 : error.statusCode) || 400;
            common_1.Logger.error('chat-error-detail  <----------------------------------------->', 'code: ', code, 'message', error === null || error === void 0 ? void 0 : error.message, 'statusText:', (_b = error === null || error === void 0 ? void 0 : error.response) === null || _b === void 0 ? void 0 : _b.statusText, 'status', (_c = error === null || error === void 0 ? void 0 : error.response) === null || _c === void 0 ? void 0 : _c.status);
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
        const typeRes = await this.chatBoxTypeEntity.find({ where: { id: (0, typeorm_2.In)(typeIds) } });
        const appRes = await this.appEntity.find({ where: { id: (0, typeorm_2.In)(appIds) } });
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
        const appInfos = await this.appEntity.find({ where: { id: (0, typeorm_2.In)(appIds) } });
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
        const typeRes = await this.chatPreTypeEntity.find({ where: { id: (0, typeorm_2.In)(typeIds) } });
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
    async sdxl(messagesHistory, inputs) {
        const { onGenerate, onSuccess, onFailure, apiKey, model, proxyUrl, modelName, timeout, chatId, isFileUpload, prompt } = inputs;
        let result = { answer: '', model: model, modelName: modelName, chatId: chatId, fileInfo: '', status: 2 };
        console.log('开始处理', { model, modelName, prompt });
        const options = {
            method: 'POST',
            url: `${proxyUrl}/v1/chat/completions`,
            timeout: timeout,
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${apiKey}`,
            },
            data: {
                model,
                messages: [{ "role": "user", "content": prompt }],
            },
        };
        try {
            const response = await (0, axios_1.default)(options);
            console.log('API响应接收', response.data);
            if (response.data.choices && response.data.choices.length > 0) {
                const choice = response.data.choices[0];
                const content = choice.message.content;
                console.log('处理内容', content);
                const regex = /\]\((https?:\/\/[^\)]+)\)/;
                const match = content.match(regex);
                if (match && match[1]) {
                    result.fileInfo = match[1];
                    console.log('找到链接', match[1]);
                }
                else {
                    console.log('没有找到链接');
                }
                let revised_prompt_cn;
                result.answer = `${prompt} 绘制成功`;
                if (result.fileInfo) {
                    onSuccess(result);
                    return;
                }
                else {
                    onFailure("No link found.");
                }
            }
            else {
                onFailure("No choices returned.");
            }
        }
        catch (error) {
            common_1.Logger.error('服务器错误，请求失败：', error);
        }
    }
    async suno(messagesHistory, inputs) {
        common_1.Logger.log('开始生成歌曲');
        const { onGenerate, onFailure, onSuccess, apiKey, model, proxyUrl, timeout, prompt } = inputs;
        let result = { answer: '', fileInfo: '', errMsg: '' };
        let fullText = '';
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
                messages: [{
                        "role": "user",
                        "content": prompt
                    }],
            },
        };
        try {
            const response = await (0, axios_1.default)(options);
            const stream = response.data;
            await new Promise((resolve, reject) => {
                stream.on('data', (chunk) => {
                    common_1.Logger.log('生成进度: ', fullText);
                    const splitArr = chunk.toString().split('\n\n').filter(line => line.trim());
                    splitArr.forEach(line => {
                        var _a, _b;
                        const videoLinkMatch = fullText.match(/\((https?:\/\/[^\)]+\.mp4)\)/);
                        if (line.trim() === "data: [DONE]" || videoLinkMatch) {
                            if (videoLinkMatch) {
                                result.fileInfo = videoLinkMatch[1];
                                onSuccess(result);
                                return;
                            }
                            return;
                        }
                        try {
                            const jsonLine = JSON.parse(line.replace(/^data: /, '').trim());
                            const content = ((_b = (_a = jsonLine.choices[0]) === null || _a === void 0 ? void 0 : _a.delta) === null || _b === void 0 ? void 0 : _b.content) || '';
                            fullText += content;
                            if (!fullText.includes('### 🎵')) {
                                if (fullText.includes('生成中..')) {
                                    result.answer = '歌曲生成中';
                                    onGenerate(result);
                                }
                                else if (fullText.includes('排队中.')) {
                                    result.answer = '排队中';
                                    onGenerate(result);
                                }
                                else {
                                    result.answer = '提交成功，歌曲生成中';
                                    onGenerate(result);
                                }
                            }
                            else if (!fullText.includes('**风格：**')) {
                                const startLyricsIndex = fullText.indexOf('### 🎵');
                                result.answer = fullText.substring(startLyricsIndex);
                                onGenerate(result);
                            }
                            else {
                                const startLyricsIndex = fullText.indexOf('### 🎵');
                                const endStyleIndex = fullText.indexOf('**风格：**');
                                result.answer = fullText.substring(startLyricsIndex, endStyleIndex);
                                onGenerate(result);
                            }
                            const videoLinkMatch = fullText.match(/\((https?:\/\/[^\)]+\.mp4)\)/);
                            if (videoLinkMatch) {
                                result.fileInfo = videoLinkMatch[1];
                                onSuccess(result);
                                return;
                            }
                        }
                        catch (error) {
                            console.error('Parse error', error, line);
                        }
                    });
                });
                stream.on('end', () => {
                    common_1.Logger.log('Stream ended');
                    resolve(result);
                });
                stream.on('error', (error) => {
                    common_1.Logger.error('Stream error:', error);
                    reject(error);
                });
            });
            return result;
        }
        catch (error) {
            result.errMsg = await this.handleError(error);
            common_1.Logger.error(result.errMsg);
            onFailure(result);
            return;
        }
    }
    async sendMessageFromAi(messagesHistory, inputs, isClientClosed) {
        if (isClientClosed) {
            console.log("操作终止，因为客户端已关闭连接");
            return;
        }
        const { onFailure, onProgress, apiKey, model, proxyUrl, modelName, timeout, chatId, isFileUpload } = inputs;
        let result = { text: '', model: '', modelName: modelName, chatId: chatId, answer: '', errMsg: '' };
        const options = {
            method: 'POST',
            url: `${proxyUrl}/v1/chat/completions`,
            responseType: "stream",
            timeout: timeout,
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${apiKey}`,
            },
            data: Object.assign({ stream: true, model, messages: messagesHistory }, (isFileUpload === 2 && { max_tokens: 2048 })),
        };
        try {
            const response = await (0, axios_1.default)(options);
            const stream = response.data;
            await new Promise((resolve, reject) => {
                stream.on('data', (chunk) => {
                    const splitArr = chunk.toString().split('\n\n').filter(line => line.trim());
                    splitArr.forEach(line => {
                        var _a, _b;
                        if (line.trim() === "data: [DONE]") {
                            console.log("处理结束信号 [DONE]");
                            resolve(result);
                            return;
                        }
                        if (isClientClosed) {
                            console.log("操作终止，因为客户端已关闭连接");
                            resolve(result);
                            return;
                        }
                        try {
                            const cleanedLine = line.replace(/^data: /, '').trim();
                            if (!cleanedLine)
                                return;
                            const jsonLine = JSON.parse(cleanedLine);
                            if (jsonLine) {
                                const content = ((_b = (_a = jsonLine.choices[0]) === null || _a === void 0 ? void 0 : _a.delta) === null || _b === void 0 ? void 0 : _b.content) || '';
                                result.answer += content;
                                onProgress === null || onProgress === void 0 ? void 0 : onProgress({ text: content, answer: result.answer });
                            }
                        }
                        catch (error) {
                            common_1.Logger.error('返回格式错误,重新提取回答', error, line);
                            const contentMatch = line.match(/"content":"([^"]+)"/);
                            if (contentMatch && contentMatch[1]) {
                                result.answer += contentMatch[1];
                                onProgress === null || onProgress === void 0 ? void 0 : onProgress({ text: contentMatch[1], answer: result.answer });
                            }
                        }
                    });
                });
                stream.on('error', reject);
            });
            return result;
        }
        catch (error) {
            result.errMsg = await this.handleError(error);
            common_1.Logger.error(result.errMsg);
            onFailure(result);
            return result;
        }
    }
    async handleError(error) {
        let message = '发生未知错误，请稍后再试';
        if (axios_1.default.isAxiosError(error) && error.response) {
            switch (error.response.status) {
                case 400:
                    message = '发生错误：400 Bad Request - 请求因格式错误无法被服务器处理。';
                    break;
                case 401:
                    message = '发生错误：401 Unauthorized - 请求要求进行身份验证。';
                    break;
                case 403:
                    message = '发生错误：403 Forbidden - 服务器拒绝执行请求。';
                    break;
                case 404:
                    message = '发生错误：404 Not Found - 请求的资源无法在服务器上找到。';
                    break;
                case 500:
                    message = '发生错误：500 Internal Server Error - 服务器内部错误，无法完成请求。';
                    break;
                case 502:
                    message = '发生错误：502 Bad Gateway - 作为网关或代理工作的服务器从上游服务器收到无效响应。';
                    break;
                case 503:
                    message = '发生错误：503 Service Unavailable - 服务器暂时处于超负载或维护状态，无法处理请求。';
                    break;
                default:
                    break;
            }
        }
        else {
            message = error.message || message;
        }
        return message;
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
                    answer: (data === null || data === void 0 ? void 0 : data.answer) || '绘制中',
                    progress: data === null || data === void 0 ? void 0 : data.progress,
                    status: 2,
                });
                common_1.Logger.log(`绘制中！绘制进度${data === null || data === void 0 ? void 0 : data.progress}`);
            },
            onFailure: async (data) => {
                await this.chatLogService.updateChatLog(assistantLogId, {
                    answer: '绘图失败',
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
        const { mjNotSaveImg, mjProxyImgUrl, mjNotUseProxy, } = await this.globalConfigService.getConfigs([
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
                    if (responses.status === 'SUCCESS') {
                        common_1.Logger.log(`绘制成功, 获取到的URL: ${responses.imageUrl}`, 'MidjourneyService');
                        let processedUrl = responses.imageUrl;
                        const shouldReplaceUrl = mjNotUseProxy === '0' && mjProxyImgUrl;
                        let logMessage = '';
                        if (shouldReplaceUrl) {
                            const newUrlBase = new URL(mjProxyImgUrl);
                            const parsedUrl = new URL(responses.imageUrl);
                            parsedUrl.protocol = newUrlBase.protocol;
                            parsedUrl.hostname = newUrlBase.hostname;
                            parsedUrl.port = newUrlBase.port ? newUrlBase.port : '';
                            processedUrl = parsedUrl.toString();
                            logMessage = `使用代理替换后的 URL: ${processedUrl}`;
                            common_1.Logger.log(logMessage, 'MidjourneyService');
                        }
                        if (mjNotSaveImg !== '1') {
                            try {
                                common_1.Logger.debug(`------> 开始上传图片！！！`);
                                const filename = `${Date.now()}-${uuid.v4().slice(0, 4)}.png`;
                                processedUrl = await this.uploadService.uploadFileFromUrl({ filename, url: processedUrl });
                                logMessage = `上传成功 URL: ${processedUrl}`;
                            }
                            catch (uploadError) {
                                common_1.Logger.error('存储图片失败，使用原始/代理图片链接');
                                logMessage = `存储图片失败，使用原始/代理图片链接 ${processedUrl}`;
                            }
                            common_1.Logger.log(logMessage, 'MidjourneyService');
                        }
                        else {
                            logMessage = `不保存图片，使用 URL: ${processedUrl}`;
                            common_1.Logger.log(logMessage, 'MidjourneyService');
                        }
                        result.fileInfo = processedUrl;
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
    __param(0, (0, typeorm_1.InjectRepository)(config_entity_1.ConfigEntity)),
    __param(1, (0, typeorm_1.InjectRepository)(chatBoxType_entity_1.ChatBoxTypeEntity)),
    __param(2, (0, typeorm_1.InjectRepository)(chatBox_entity_1.ChatBoxEntity)),
    __param(3, (0, typeorm_1.InjectRepository)(app_entity_1.AppEntity)),
    __param(4, (0, typeorm_1.InjectRepository)(chatPreType_entity_1.ChatPreTypeEntity)),
    __param(5, (0, typeorm_1.InjectRepository)(chatPre_entity_1.ChatPreEntity)),
    __metadata("design:paramtypes", [typeorm_2.Repository,
        typeorm_2.Repository,
        typeorm_2.Repository,
        typeorm_2.Repository,
        typeorm_2.Repository,
        typeorm_2.Repository,
        apiDataService_service_1.ApiDataService,
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
