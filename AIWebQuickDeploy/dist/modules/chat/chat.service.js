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
const utils_1 = require("../../common/utils");
const common_1 = require("@nestjs/common");
const typeorm_1 = require("@nestjs/typeorm");
const axios_1 = require("axios");
const typeorm_2 = require("typeorm");
const aiPPT_1 = require("../ai/aiPPT");
const cogVideo_service_1 = require("../ai/cogVideo.service");
const fluxDraw_service_1 = require("../ai/fluxDraw.service");
const lumaVideo_service_1 = require("../ai/lumaVideo.service");
const midjourneyDraw_service_1 = require("../ai/midjourneyDraw.service");
const openaiChat_service_1 = require("../ai/openaiChat.service");
const openaiDraw_service_1 = require("../ai/openaiDraw.service");
const stableDiffusion_service_1 = require("../ai/stableDiffusion.service");
const suno_service_1 = require("../ai/suno.service");
const app_entity_1 = require("../app/app.entity");
const autoreply_service_1 = require("../autoreply/autoreply.service");
const badWords_service_1 = require("../badWords/badWords.service");
const chatGroup_service_1 = require("../chatGroup/chatGroup.service");
const chatLog_service_1 = require("../chatLog/chatLog.service");
const config_entity_1 = require("../globalConfig/config.entity");
const globalConfig_service_1 = require("../globalConfig/globalConfig.service");
const models_service_1 = require("../models/models.service");
const plugin_entity_1 = require("../plugin/plugin.entity");
const upload_service_1 = require("../upload/upload.service");
const user_service_1 = require("../user/user.service");
const userBalance_service_1 = require("../userBalance/userBalance.service");
const netSearch_service_1 = require("../ai/netSearch.service");
let ChatService = class ChatService {
    constructor(configEntity, appEntity, pluginEntity, sunoService, openAIChatService, chatLogService, midjourneyService, stableDiffusionService, userBalanceService, userService, uploadService, badWordsService, autoreplyService, globalConfigService, chatGroupService, modelsService, openAIDrawService, lumaVideoService, cogVideoService, fluxDrawService, aiPptService, netSearchService) {
        this.configEntity = configEntity;
        this.appEntity = appEntity;
        this.pluginEntity = pluginEntity;
        this.sunoService = sunoService;
        this.openAIChatService = openAIChatService;
        this.chatLogService = chatLogService;
        this.midjourneyService = midjourneyService;
        this.stableDiffusionService = stableDiffusionService;
        this.userBalanceService = userBalanceService;
        this.userService = userService;
        this.uploadService = uploadService;
        this.badWordsService = badWordsService;
        this.autoreplyService = autoreplyService;
        this.globalConfigService = globalConfigService;
        this.chatGroupService = chatGroupService;
        this.modelsService = modelsService;
        this.openAIDrawService = openAIDrawService;
        this.lumaVideoService = lumaVideoService;
        this.cogVideoService = cogVideoService;
        this.fluxDrawService = fluxDrawService;
        this.aiPptService = aiPptService;
        this.netSearchService = netSearchService;
    }
    async chatProcess(body, req, res) {
        await this.userBalanceService.checkUserCertification(req.user.id);
        const { options = {}, usingPluginId, appId = null, specialModel, prompt, fileInfo, extraParam, model, drawId, customId, action, modelName, modelAvatar, } = body;
        let appInfo;
        if (specialModel) {
            appInfo = await this.appEntity.findOne({
                where: { des: specialModel, isSystemReserved: true },
            });
        }
        else if (appId) {
            appInfo = await this.appEntity.findOne({
                where: { id: appId, status: (0, typeorm_2.In)([1, 3, 4, 5]) },
            });
            if (!appInfo) {
                throw new common_1.HttpException('你当前使用的应用已被下架、请删除当前对话开启新的对话吧！', common_1.HttpStatus.BAD_REQUEST);
            }
        }
        const { groupId, fileParsing } = options;
        const { openaiTimeout, openaiBaseUrl, openaiBaseKey, systemPreMessage, isMjTranslate, mjTranslatePrompt, openaiTemperature, openaiBaseModel, isGeneratePromptReference, isConvertToBase64, isSensitiveWordFilter, } = await this.globalConfigService.getConfigs([
            'openaiTimeout',
            'openaiBaseUrl',
            'openaiBaseKey',
            'systemPreMessage',
            'isMjTranslate',
            'mjTranslatePrompt',
            'openaiTemperature',
            'openaiBaseModel',
            'isGeneratePromptReference',
            'isConvertToBase64',
            'isSensitiveWordFilter',
        ]);
        await this.userService.checkUserStatus(req.user);
        res &&
            res.setHeader('Content-type', 'application/octet-stream; charset=utf-8');
        if (isSensitiveWordFilter === '1') {
            const triggeredWords = await this.badWordsService.checkBadWords(prompt, req.user.id);
            if (triggeredWords.length > 0) {
                const tips = `您提交的信息中包含违规的内容，我们已对您的账户进行标记，请合规使用！`;
                throw new common_1.HttpException(tips, common_1.HttpStatus.BAD_REQUEST);
            }
        }
        const autoReplyRes = await this.autoreplyService.checkAutoReply(prompt);
        let currentRequestModelKey = null;
        let appName = '';
        let setSystemMessage = '';
        res && res.status(200);
        let response = null;
        const curIp = (0, utils_1.getClientIp)(req);
        let usePrompt;
        let useModelAvatar = '';
        let usingPlugin;
        let searchResult;
        if (usingPluginId) {
            usingPlugin = await this.pluginEntity.findOne({
                where: { id: usingPluginId },
            });
        }
        if (appInfo) {
            const { isGPTs, gizmoID, name, isFixedModel, appModel, coverImg } = appInfo;
            useModelAvatar = coverImg;
            appName = name;
            if (isGPTs) {
                currentRequestModelKey =
                    await this.modelsService.getCurrentModelKeyInfo('gpts');
                currentRequestModelKey.model = `gpt-4-gizmo-${gizmoID}`;
            }
            else if (!isGPTs && isFixedModel && appModel) {
                appInfo.preset && (setSystemMessage = appInfo.preset);
                currentRequestModelKey =
                    await this.modelsService.getCurrentModelKeyInfo(appModel);
                currentRequestModelKey.model = appModel;
                if (fileParsing) {
                    setSystemMessage = `${setSystemMessage}以下是我提供给你的知识库：【${fileParsing}】，在回答问题之前，先检索知识库内有没有相关的内容，尽量使用知识库中获取到的信息来回答我的问题，以知识库中的为准。`;
                }
                common_1.Logger.log(`固定模型、使用应用预设: ${setSystemMessage}`, 'ChatService');
            }
            else {
                appInfo.preset && (setSystemMessage = appInfo.preset);
                currentRequestModelKey =
                    await this.modelsService.getCurrentModelKeyInfo(model);
                if (fileParsing) {
                    setSystemMessage = `${setSystemMessage}以下是我提供给你的知识库：【${fileParsing}】，在回答问题之前，先检索知识库内有没有相关的内容，尽量使用知识库中获取到的信息来回答我的问题，以知识库中的为准。`;
                }
                common_1.Logger.log(`使用应用预设: ${setSystemMessage}`, 'ChatService');
            }
        }
        else {
            const groupInfo = await this.chatGroupService.getGroupInfoFromId(groupId);
            if ((usingPlugin === null || usingPlugin === void 0 ? void 0 : usingPlugin.parameters) === 'net-search') {
                try {
                    searchResult = await this.netSearchService.webSearchPro(prompt);
                }
                catch (error) {
                    common_1.Logger.error('网络请求失败', error);
                    searchResult = null;
                }
                const now = new Date();
                const options = {
                    timeZone: 'Asia/Shanghai',
                    year: 'numeric',
                    month: '2-digit',
                    day: '2-digit',
                    hour: '2-digit',
                    minute: '2-digit',
                    hour12: false,
                };
                const currentDate = new Intl.DateTimeFormat('zh-CN', options).format(now);
                let searchPrompt = '';
                if (searchResult) {
                    searchPrompt = JSON.stringify(searchResult, null, 2);
                }
                setSystemMessage = `
          你的任务是根据用户的问题，通过下面的搜索结果提供更精确、详细、具体的回答。
          请在适当的情况下在对应部分句子末尾标注引用的链接，使用[[序号resultIndex](链接地址link)]格式，同时使用多个链接可连续使用比如[[2](链接地址)][[5](链接地址)]，
          在回答的最后，使用 序号resultIndex.[title](链接地址link) 标记出所有的来源。
          以下是搜索结果：
            ${searchPrompt}
            在回答时，请注意以下几点：
              - 现在时间是: ${currentDate}。
              - 并非搜索结果的所有内容都与用户的问题密切相关，你需要结合问题，对搜索结果进行甄别、筛选。
              - 对于列举类的问题（如列举所有航班信息），尽量将答案控制在10个要点以内，并告诉用户可以查看搜索来源、获得完整信息。优先提供信息完整、最相关的列举项；如非必要，不要主动告诉用户搜索结果未提供的内容。
              - 对于创作类的问题（如写论文），请务必在正文的段落中引用对应的参考编号。你需要解读并概括用户的题目要求，选择合适的格式，充分利用搜索结果并抽取重要信息，生成符合用户要求、极具思想深度、富有创造力与专业性的答案。你的创作篇幅需要尽可能延长，对于每一个要点的论述要推测用户的意图，给出尽可能多角度的回答要点，且务必信息量大、论述详尽。
              - 如果回答很长，请尽量结构化、分段落总结。如果需要分点作答，尽量控制在5个点以内，并合并相关的内容。
              - 对于客观类的问答，如果问题的答案非常简短，可以适当补充一到两句相关信息，以丰富内容。
              - 你需要根据用户要求和回答内容选择合适、美观的回答格式，确保可读性强。
              - 你的回答应该综合多个相关网页来回答，不能只重复引用一个网页。
              - 除非用户要求，否则你回答的语言需要和用户提问的语言保持一致。
            `;
                currentRequestModelKey =
                    await this.modelsService.getCurrentModelKeyInfo(model);
            }
            else if ((usingPlugin === null || usingPlugin === void 0 ? void 0 : usingPlugin.parameters) === 'mind-map') {
                setSystemMessage =
                    'Please provide a detailed outline in Markdown format: Use a multi-level structure with at least 3-4 levels. Include specific solutions or steps under each topic. Make it suitable for creating mind maps. Provide only the outline content without any irrelevant explanations. Start directly with the outline, no introduction needed. Use the language I asked in. Note: Use #, ##, ### etc. for different heading levels. Use - or * for list items. Use bold, italic etc. to emphasize key points. Use tables, code blocks etc. as needed. Please provide a clear, content-rich Markdown format outline based on these requirements.';
                currentRequestModelKey =
                    await this.modelsService.getCurrentModelKeyInfo(model);
                common_1.Logger.log(`使用插件预设: ${setSystemMessage}`, 'ChatService');
            }
            else if (fileParsing) {
                setSystemMessage = `以下是我提供给你的知识库：【${fileParsing}】，在回答问题之前，先检索知识库内有没有相关的内容，尽量使用知识库中获取到的信息来回答我的问题，以知识库中的为准。`;
                currentRequestModelKey =
                    await this.modelsService.getCurrentModelKeyInfo(model);
                common_1.Logger.log(`使用文件解析: ${setSystemMessage}`, 'ChatService');
            }
            else {
                const currentDate = new Date().toISOString().split('T')[0];
                setSystemMessage = systemPreMessage + `\n Current date: ${currentDate}`;
                currentRequestModelKey =
                    await this.modelsService.getCurrentModelKeyInfo(model);
                common_1.Logger.log(`使用全局预设: ${setSystemMessage}`, 'ChatService');
            }
        }
        if (!currentRequestModelKey) {
            common_1.Logger.debug('未找到当前模型key，切换至全局模型', 'ChatService');
            currentRequestModelKey = await this.modelsService.getCurrentModelKeyInfo(openaiBaseModel);
            const groupInfo = await this.chatGroupService.getGroupInfoFromId(groupId);
            let updatedConfig = groupInfo.config;
            try {
                const parsedConfig = JSON.parse(groupInfo.config);
                if (parsedConfig.modelInfo) {
                    parsedConfig.modelInfo.modelName = currentRequestModelKey.modelName;
                    parsedConfig.modelInfo.model = currentRequestModelKey.model;
                    updatedConfig = JSON.stringify(parsedConfig);
                }
            }
            catch (error) {
                common_1.Logger.debug('模型切换错误，请检查全局模型配置！', 'ChatService');
                throw new common_1.HttpException('配置解析错误！', common_1.HttpStatus.BAD_REQUEST);
            }
            await this.chatGroupService.update({
                groupId,
                title: groupInfo.title,
                isSticky: false,
                config: updatedConfig,
                fileUrl: '',
            }, req);
        }
        const { deduct, isTokenBased, tokenFeeRatio, deductType, key, id: keyId, maxRounds, proxyUrl, maxModelTokens, timeout, model: useModel, isFileUpload, keyType: modelType, } = currentRequestModelKey;
        if (await this.chatLogService.checkModelLimits(req.user, useModel)) {
            throw new common_1.HttpException('1 小时内对话次数过多，请切换模型或稍后再试！', common_1.HttpStatus.TOO_MANY_REQUESTS);
        }
        if (isMjTranslate === '1' &&
            action === 'IMAGINE' &&
            model === 'midjourney') {
            const [beforeArgs, afterArgs] = prompt.split(/(?= --)/);
            const urlPattern = /(https?:\/\/[^\s]+)/g;
            const urls = beforeArgs.match(urlPattern) || [];
            let textToTranslate = beforeArgs.replace(urlPattern, '').trim();
            const translatedText = await this.openAIChatService.chatFree(textToTranslate, mjTranslatePrompt ||
                "Translate any given phrase from any language into English. For instance, when I input '{可爱的熊猫}', you should output '{cute panda}', with no period at the end.");
            const finalTranslatedPrompt = [...urls, translatedText].join(' ').trim();
            usePrompt = afterArgs
                ? `${finalTranslatedPrompt}${afterArgs}`
                : finalTranslatedPrompt;
            if (isFileUpload === '1' && fileInfo) {
                usePrompt = `${fileInfo} ${usePrompt}`;
            }
        }
        else {
            usePrompt =
                isFileUpload === '1' && fileInfo ? fileInfo + ' ' + prompt : prompt;
        }
        await this.userBalanceService.validateBalance(req, deductType, deduct);
        const useModeName = modelName;
        const proxyResUrl = (0, utils_1.formatUrl)(proxyUrl || openaiBaseUrl || 'https://api.openai.com');
        const modelKey = key || openaiBaseKey;
        const modelTimeout = (timeout || openaiTimeout || 300) * 1000;
        const temperature = Number(openaiTemperature) || 1;
        if (groupId) {
            const groupInfo = await this.chatGroupService.getGroupInfoFromId(groupId);
            this.updateChatTitle(groupId, groupInfo, modelType, prompt, req);
            await this.chatGroupService.updateTime(groupId);
        }
        const userSaveLog = await this.chatLogService.saveChatLog({
            appId: appId,
            curIp,
            userId: req.user.id,
            type: modelType ? modelType : 1,
            prompt,
            fileInfo: fileInfo ? fileInfo : null,
            answer: '',
            promptTokens: 0,
            completionTokens: 0,
            totalTokens: 0,
            model: useModel,
            modelName: '我',
            role: 'user',
            groupId: groupId ? groupId : null,
        });
        const assistantSaveLog = await this.chatLogService.saveChatLog({
            appId: appId ? appId : null,
            action: action ? action : null,
            curIp,
            userId: req.user.id,
            type: modelType ? modelType : 1,
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
            groupId: groupId ? groupId : null,
            status: 2,
            modelAvatar: (usingPlugin === null || usingPlugin === void 0 ? void 0 : usingPlugin.pluginImg) || useModelAvatar || modelAvatar || '',
            pluginParam: (usingPlugin === null || usingPlugin === void 0 ? void 0 : usingPlugin.parameters)
                ? usingPlugin.parameters
                : modelType === 2
                    ? useModel
                    : null,
        });
        const userLogId = userSaveLog.id;
        const assistantLogId = assistantSaveLog.id;
        if (autoReplyRes.answer && res) {
            if (autoReplyRes.isAIReplyEnabled === 0) {
                const chars = autoReplyRes.answer.split('');
                const sendCharByChar = (index) => {
                    if (index < chars.length) {
                        const msg = { text: chars[index] };
                        res.write(`${JSON.stringify(msg)}\n`);
                        setTimeout(() => sendCharByChar(index + 1), 10);
                    }
                    else {
                        res.end();
                    }
                };
                sendCharByChar(0);
                await this.chatLogService.updateChatLog(assistantLogId, {
                    answer: autoReplyRes.answer,
                });
                return;
            }
            else {
                setSystemMessage = setSystemMessage + autoReplyRes.answer;
            }
        }
        const { messagesHistory } = await this.buildMessageFromParentMessageId(prompt, {
            groupId,
            systemMessage: setSystemMessage,
            maxModelTokens,
            maxRounds: maxRounds,
            isConvertToBase64: isConvertToBase64,
            fileInfo: fileInfo,
            model: useModel,
            isFileUpload,
        }, this.chatLogService);
        let charge = action !== 'UPSCALE' && useModel === 'midjourney' ? deduct * 4 : deduct;
        const abortController = new AbortController();
        try {
            if (res) {
                res.on('close', () => {
                    abortController.abort();
                });
                let response;
                let firstChunk = true;
                try {
                    if ((useModel === 'dall-e-3' ||
                        useModel === 'midjourney' ||
                        useModel === 'ai-ppt' ||
                        useModel === 'suno-music' ||
                        useModel === 'luma-video' ||
                        useModel.includes('stable-diffusion') ||
                        useModel.includes('cog-video') ||
                        useModel.includes('flux')) &&
                        modelType === 2) {
                        if (useModel === 'dall-e-3') {
                            response = this.openAIDrawService.dalleDraw({
                                prompt: prompt,
                                extraParam: extraParam,
                                apiKey: modelKey,
                                proxyUrl: proxyResUrl,
                                model: useModel,
                                timeout: modelTimeout,
                                modelName: useModeName,
                                groupId: groupId,
                                onSuccess: async (data) => {
                                    await this.chatLogService.updateChatLog(assistantLogId, {
                                        fileInfo: data === null || data === void 0 ? void 0 : data.fileInfo,
                                        answer: (data === null || data === void 0 ? void 0 : data.answer) || prompt,
                                        progress: '100%',
                                        status: data.status,
                                    });
                                },
                                onFailure: async (data) => {
                                    await this.chatLogService.updateChatLog(assistantLogId, {
                                        answer: '绘图失败',
                                        status: data.status,
                                    });
                                },
                            }, this.buildMessageFromParentMessageId);
                            await this.chatLogService.updateChatLog(assistantLogId, {
                                answer: '绘制中',
                            });
                        }
                        else if (useModel === 'ai-ppt') {
                            common_1.Logger.log('开始生成PPT', 'DrawService');
                            response = this.aiPptService.aiPPT({
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
                                extraParam,
                                fileInfo,
                            });
                            await this.chatLogService.updateChatLog(assistantLogId, {
                                answer: '生成中',
                            });
                        }
                        else if (useModel.includes('flux')) {
                            response = this.fluxDrawService.fluxDraw({
                                prompt: prompt,
                                extraParam: extraParam,
                                apiKey: modelKey,
                                proxyUrl: proxyResUrl,
                                model: useModel,
                                timeout: modelTimeout,
                                modelName: useModeName,
                                groupId: groupId,
                                onSuccess: async (data) => {
                                    await this.chatLogService.updateChatLog(assistantLogId, {
                                        fileInfo: data === null || data === void 0 ? void 0 : data.fileInfo,
                                        answer: (data === null || data === void 0 ? void 0 : data.answer) || prompt,
                                        progress: '100%',
                                        status: data.status,
                                    });
                                },
                                onFailure: async (data) => {
                                    await this.chatLogService.updateChatLog(assistantLogId, {
                                        answer: '绘图失败',
                                        status: data.status,
                                    });
                                },
                            }, this.buildMessageFromParentMessageId);
                            await this.chatLogService.updateChatLog(assistantLogId, {
                                answer: '绘制中',
                            });
                        }
                        else if (useModel.includes('suno-music')) {
                            response = this.sunoService.suno({
                                assistantLogId,
                                apiKey: modelKey,
                                action,
                                prompt,
                                timeout: modelTimeout,
                                proxyUrl: proxyResUrl,
                                taskData: customId,
                            });
                            await this.chatLogService.updateChatLog(assistantLogId, {
                                answer: '提交成功，歌曲生成中',
                            });
                        }
                        else if (useModel.includes('luma-video')) {
                            response = this.lumaVideoService.lumaVideo({
                                fileInfo,
                                extraParam,
                                assistantLogId,
                                apiKey: modelKey,
                                action,
                                prompt,
                                model: useModel,
                                timeout: modelTimeout,
                                proxyUrl: proxyResUrl,
                                taskData: customId,
                                onGenerate: async (data) => {
                                    await this.chatLogService.updateChatLog(assistantLogId, {
                                        fileInfo: data === null || data === void 0 ? void 0 : data.fileInfo,
                                        answer: (data === null || data === void 0 ? void 0 : data.answer) || prompt,
                                        status: 2,
                                    });
                                },
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
                                        answer: data.errMsg,
                                        status: 4,
                                    });
                                },
                            });
                            await this.chatLogService.updateChatLog(assistantLogId, {
                                answer: '提交成功，视频生成中',
                            });
                        }
                        else if (useModel.includes('cog-video')) {
                            response = this.cogVideoService.cogVideo({
                                fileInfo,
                                extraParam,
                                assistantLogId,
                                apiKey: modelKey,
                                action,
                                prompt,
                                model: useModel,
                                timeout: modelTimeout,
                                proxyUrl: proxyResUrl,
                                taskData: customId,
                                onGenerate: async (data) => {
                                    await this.chatLogService.updateChatLog(assistantLogId, {
                                        fileInfo: data === null || data === void 0 ? void 0 : data.fileInfo,
                                        answer: (data === null || data === void 0 ? void 0 : data.answer) || prompt,
                                        status: 2,
                                    });
                                },
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
                                        answer: data.errMsg,
                                        status: 4,
                                    });
                                },
                            });
                            await this.chatLogService.updateChatLog(assistantLogId, {
                                answer: '提交成功，视频生成中',
                            });
                        }
                        else if (useModel.includes('stable-diffusion')) {
                            response = this.stableDiffusionService.sdxl({
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
                                },
                            });
                            await this.chatLogService.updateChatLog(assistantLogId, {
                                answer: '绘制中',
                            });
                        }
                        else {
                            response = await this.midjourneyService.midjourneyDraw({
                                usePrompt: usePrompt,
                                prompt: prompt,
                                apiKey: modelKey,
                                proxyUrl: proxyResUrl,
                                model: useModel,
                                modelName: useModeName,
                                drawId,
                                customId,
                                action,
                                fileInfo,
                                timeout: modelTimeout,
                                assistantLogId,
                            });
                            await this.chatLogService.updateChatLog(assistantLogId, {
                                answer: response.answer,
                                status: response.status,
                            });
                        }
                        if (response.status !== 5) {
                            await this.modelsService.saveUseLog(keyId, 1);
                            await this.userBalanceService.deductFromBalance(req.user.id, deductType, charge);
                        }
                        else {
                            common_1.Logger.log('任务提交失败，不执行扣费', 'ChatService');
                        }
                        const userBalance = await this.userBalanceService.queryUserBalance(req.user.id);
                        response.userBalance = Object.assign({}, userBalance);
                        response.text = response.answer;
                        response.status = response.status || 2;
                        response.model = model;
                        response.modelName = modelName;
                        return res.write(`\n${JSON.stringify(response)}`);
                    }
                    else {
                        response = await this.openAIChatService.openAIChat(messagesHistory, {
                            chatId: assistantLogId,
                            maxModelTokens,
                            apiKey: modelKey,
                            model: useModel,
                            modelName: useModeName,
                            temperature,
                            modelType,
                            prompt,
                            fileInfo,
                            isFileUpload,
                            timeout: modelTimeout,
                            proxyUrl: proxyResUrl,
                            modelAvatar: modelAvatar,
                            onProgress: (chat) => {
                                res.write(firstChunk
                                    ? JSON.stringify(chat)
                                    : `\n${JSON.stringify(chat)}`);
                                firstChunk = false;
                            },
                            onFailure: async (data) => {
                                await this.chatLogService.updateChatLog(assistantLogId, {
                                    answer: data.errMsg,
                                    status: 4,
                                });
                            },
                            abortController,
                        });
                        if (response.errMsg) {
                            common_1.Logger.error(`用户ID: ${req.user.id} 模型名称: ${useModeName} 模型: ${model} 回复出错，本次不扣除积分`, 'ChatService');
                            return res.write(`\n${JSON.stringify(response)}`);
                        }
                        let totalText = '';
                        messagesHistory.forEach((messagesHistory) => {
                            totalText += messagesHistory.content + ' ';
                        });
                        const promptTokens = await (0, utils_1.getTokenCount)(totalText);
                        const completionTokens = await (0, utils_1.getTokenCount)(response.answer);
                        await this.chatLogService.updateChatLog(userLogId, {
                            promptTokens: promptTokens,
                            completionTokens: completionTokens,
                            totalTokens: promptTokens + completionTokens,
                        });
                        let sanitizedAnswer = response.answer;
                        if (isSensitiveWordFilter === '1') {
                            const triggeredWords = await this.badWordsService.checkBadWords(response.answer, req.user.id);
                            if (triggeredWords.length > 0) {
                                const regex = new RegExp(triggeredWords.join('|'), 'gi');
                                sanitizedAnswer = sanitizedAnswer.replace(regex, (matched) => '*'.repeat(matched.length));
                            }
                        }
                        await this.chatLogService.updateChatLog(assistantLogId, {
                            fileInfo: response === null || response === void 0 ? void 0 : response.fileInfo,
                            answer: sanitizedAnswer,
                            promptTokens: promptTokens,
                            completionTokens: completionTokens,
                            totalTokens: promptTokens + completionTokens,
                            status: 3,
                        });
                        try {
                            if (isGeneratePromptReference === '1') {
                                const promptReference = await this.openAIChatService.chatFree(`根据用户提问{${prompt}}以及 AI 的回答{${response.answer}}，生成三个更进入一步的提问，用{}包裹每个问题，不需要分行，不需要其他任何内容，单个提问不超过30个字`);
                                await this.chatLogService.updateChatLog(assistantLogId, {
                                    promptReference: promptReference,
                                });
                            }
                        }
                        catch (error) {
                            common_1.Logger.error(`调用 chatFree 出错: ${error}`);
                        }
                        if (isTokenBased === true) {
                            charge =
                                deduct *
                                    Math.ceil((promptTokens + completionTokens) / tokenFeeRatio);
                        }
                        await this.userBalanceService.deductFromBalance(req.user.id, deductType, charge, promptTokens + completionTokens);
                        await this.modelsService.saveUseLog(keyId, promptTokens + completionTokens);
                        common_1.Logger.log(`用户ID: ${req.user.id} 模型名称: ${useModeName} 模型: ${model} 消耗token: ${promptTokens + completionTokens}, 消耗积分： ${charge}`, 'ChatService');
                        const userBalance = await this.userBalanceService.queryUserBalance(req.user.id);
                        response.userBalance = Object.assign({}, userBalance);
                        return res.write(`\n${JSON.stringify(response)}`);
                    }
                }
                catch (error) {
                    common_1.Logger.error('发生错误:', error);
                    await this.chatLogService.updateChatLog(assistantLogId, {
                        status: 5,
                    });
                    response = { error: '处理请求时发生错误' };
                }
            }
            else {
                response = await this.openAIChatService.openAIChat(messagesHistory, {
                    chatId: assistantLogId,
                    maxModelTokens,
                    apiKey: modelKey,
                    model: useModel,
                    modelName: useModeName,
                    modelType,
                    temperature,
                    prompt,
                    fileInfo,
                    isFileUpload,
                    timeout: modelTimeout,
                    proxyUrl: proxyResUrl,
                    abortController,
                });
                await this.userBalanceService.deductFromBalance(req.user.id, deductType, charge);
                return response.answer;
            }
        }
        catch (error) {
            common_1.Logger.error('chat-error <----------------------------------------->', modelKey, error);
            if (res) {
                return res.write('发生未知错误，请稍后再试');
            }
            else {
                throw new common_1.HttpException('发生未知错误，请稍后再试', common_1.HttpStatus.BAD_REQUEST);
            }
        }
        finally {
            res && res.end();
        }
    }
    async usePlugin(prompt, pluginParam) {
        const { pluginUrl, pluginKey } = await this.globalConfigService.getConfigs([
            'pluginUrl',
            'pluginKey',
        ]);
        const key = pluginKey;
        const proxyUrl = pluginUrl;
        const options = {
            method: 'POST',
            url: `${proxyUrl}/plugins/${pluginParam}`,
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${key}`,
            },
            data: {
                prompt: prompt,
            },
        };
        try {
            const response = await (0, axios_1.default)(options);
            common_1.Logger.log(`插件调用成功 返回结果: ${JSON.stringify(response.data, null, 2)}`, 'PluginService');
            return response.data.text;
        }
        catch (error) {
            common_1.Logger.error('error: ', error);
        }
    }
    async updateChatTitle(groupId, groupInfo, modelType, prompt, req) {
        if ((groupInfo === null || groupInfo === void 0 ? void 0 : groupInfo.title) === '新对话') {
            let chatTitle;
            if (modelType === 1) {
                try {
                    chatTitle = await this.openAIChatService.chatFree(`根据用户提问{${prompt}}，给这个对话取一个名字，不超过10个字`);
                    if (chatTitle.length > 15) {
                        chatTitle = chatTitle.slice(0, 15);
                    }
                }
                catch (error) {
                    common_1.Logger.error(`调用 chatFree 出错: ${error}`);
                    chatTitle = prompt.slice(0, 10);
                }
            }
            else {
                chatTitle = '创意 AI';
            }
            this.chatGroupService
                .update({
                groupId,
                title: chatTitle,
                isSticky: false,
                config: '',
                fileUrl: '',
            }, req)
                .then(() => common_1.Logger.log(`更新标题名称为: ${chatTitle}`, 'ChatService'))
                .catch((error) => common_1.Logger.error(`更新对话组标题失败: ${error}`));
        }
    }
    async buildMessageFromParentMessageId(text, options, chatLogService) {
        let { systemMessage = '', fileInfo, groupId, maxRounds = 5, maxModelTokens = 8000, isFileUpload = 0, isConvertToBase64, } = options;
        if (systemMessage.length > maxModelTokens) {
            common_1.Logger.log('系统消息超过最大长度，将被截断', 'ChatService');
            systemMessage = systemMessage.slice(0, maxModelTokens);
        }
        let messages = [];
        if (systemMessage) {
            messages.push({ role: 'system', content: systemMessage });
        }
        if (groupId) {
            const history = await chatLogService.chatHistory(groupId, maxRounds);
            let tempUserMessage = null;
            for (const record of history) {
                try {
                    let content;
                    if ((isFileUpload === 2 || isFileUpload === 3) &&
                        record.fileInfo &&
                        record.role === 'user') {
                        const imageUrls = await Promise.all(record.fileInfo.split(',').map(async (url) => ({
                            type: 'image_url',
                            image_url: {
                                url: isConvertToBase64 === '1'
                                    ? await this.convertUrlToBase64(url.trim())
                                    : url.trim(),
                            },
                        })));
                        content = [{ type: 'text', text: record.text }, ...imageUrls];
                    }
                    else if (isFileUpload === 1 &&
                        record.fileInfo &&
                        record.role === 'user') {
                        content = record.fileInfo + '\n' + record.text;
                    }
                    else {
                        content = record.text;
                    }
                    if (record.role === 'user') {
                        tempUserMessage = { role: record.role, content };
                    }
                    else if (record.role === 'assistant') {
                        const contentStr = Array.isArray(content)
                            ? JSON.stringify(content)
                            : content;
                        if (tempUserMessage && contentStr.trim() !== '') {
                            messages.push(tempUserMessage);
                            messages.push({ role: record.role, content });
                            tempUserMessage = null;
                        }
                    }
                }
                catch (error) {
                    common_1.Logger.error('处理历史记录时出错:', error, '记录:', JSON.stringify(record, null, 2));
                }
            }
        }
        let currentMessageContent;
        if ((isFileUpload === 2 || isFileUpload === 3) && fileInfo) {
            const imageUrls = await Promise.all(fileInfo.split(',').map(async (url) => ({
                type: 'image_url',
                image_url: {
                    url: isConvertToBase64 === '1'
                        ? await this.convertUrlToBase64(url.trim())
                        : url.trim(),
                },
            })));
            currentMessageContent = [{ type: 'text', text }, ...imageUrls];
        }
        else if (isFileUpload === 1 && fileInfo) {
            currentMessageContent = fileInfo + '\n' + text;
        }
        else {
            currentMessageContent = text;
        }
        messages.push({ role: 'user', content: currentMessageContent });
        let totalTokens = await (0, utils_1.getTokenCount)(messages);
        let tokenLimit;
        if (maxModelTokens < 8000) {
            tokenLimit = 4000;
        }
        else {
            tokenLimit = maxModelTokens - 4000;
        }
        while (totalTokens > tokenLimit) {
            if (messages.length === 2 &&
                messages[0].role === 'system' &&
                messages[1].role === 'user') {
                break;
            }
            let foundPairToDelete = false;
            for (let i = 0; i < messages.length; i++) {
                if (messages[i].role !== 'system' &&
                    messages[i + 1] &&
                    messages[i + 1].role === 'assistant') {
                    messages.splice(i, 2);
                    foundPairToDelete = true;
                    break;
                }
            }
            if (!foundPairToDelete) {
                for (let i = 0; i < messages.length; i++) {
                    if (messages[i].role === 'user') {
                        messages.splice(i, 1);
                        break;
                    }
                }
            }
            totalTokens = await (0, utils_1.getTokenCount)(messages);
            if (messages.length <= 2) {
                break;
            }
        }
        return {
            messagesHistory: messages,
            round: messages.length,
        };
    }
    async convertUrlToBase64(url) {
        try {
            console.log(`正在尝试转换URL为Base64: ${url}`);
            const response = await axios_1.default.get(url, { responseType: 'arraybuffer' });
            const buffer = Buffer.from(response.data, 'binary');
            console.log(`成功获取图片，正在转换为Base64: ${url}`);
            const base64Data = `data:${response.headers['content-type']};base64,${buffer.toString('base64')}`;
            console.log(`成功转换URL为Base64: ${url}`);
            return base64Data;
        }
        catch (error) {
            console.error('转换URL为Base64时发生错误:', error);
            console.warn(`返回原始链接: ${url}`);
            return url;
        }
    }
    async ttsProcess(body, req, res) {
        const { chatId, prompt } = body;
        const detailKeyInfo = await this.modelsService.getCurrentModelKeyInfo('tts-1');
        const { openaiTimeout, openaiBaseUrl, openaiBaseKey, openaiVoice } = await this.globalConfigService.getConfigs([
            'openaiTimeout',
            'openaiBaseUrl',
            'openaiBaseKey',
            'openaiVoice',
        ]);
        const { key, proxyUrl, deduct, deductType, timeout } = detailKeyInfo;
        const useKey = key || openaiBaseKey;
        const useUrl = (0, utils_1.formatUrl)(proxyUrl || openaiBaseUrl);
        const useTimeout = (timeout || openaiTimeout) * 1000;
        await this.userBalanceService.validateBalance(req, deductType, deduct);
        common_1.Logger.log('开始 TTS 请求:', prompt, 'TTSService');
        const options = {
            method: 'POST',
            url: `${useUrl}/v1/audio/speech`,
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${useKey}`,
            },
            responseType: 'arraybuffer',
            timeout: useTimeout,
            data: {
                model: 'tts-1',
                input: prompt,
                voice: openaiVoice || 'onyx',
            },
        };
        try {
            const response = await (0, axios_1.default)(options);
            common_1.Logger.log('TTS 请求获取成功', 'TTSService');
            const buffer = Buffer.from(response.data);
            const now = new Date();
            const year = now.getFullYear();
            const month = String(now.getMonth() + 1).padStart(2, '0');
            const day = String(now.getDate()).padStart(2, '0');
            const currentDate = `${year}${month}/${day}`;
            const ttsUrl = await this.uploadService.uploadFile({ buffer, mimetype: 'audio/mpeg' }, `audio/openai/${currentDate}`);
            await Promise.all([
                this.chatLogService.updateChatLog(chatId, { ttsUrl }),
                this.userBalanceService.deductFromBalance(req.user.id, deductType, deduct),
            ]);
            res.status(200).send({ ttsUrl });
        }
        catch (error) {
            common_1.Logger.error('TTS 请求或上传过程失败:', error, 'TTSService');
            res.status(500).send({ error: 'Failed to process TTS request' });
        }
    }
};
ChatService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, typeorm_1.InjectRepository)(config_entity_1.ConfigEntity)),
    __param(1, (0, typeorm_1.InjectRepository)(app_entity_1.AppEntity)),
    __param(2, (0, typeorm_1.InjectRepository)(plugin_entity_1.PluginEntity)),
    __metadata("design:paramtypes", [typeorm_2.Repository,
        typeorm_2.Repository,
        typeorm_2.Repository,
        suno_service_1.SunoService,
        openaiChat_service_1.OpenAIChatService,
        chatLog_service_1.ChatLogService,
        midjourneyDraw_service_1.MidjourneyService,
        stableDiffusion_service_1.StableDiffusionService,
        userBalance_service_1.UserBalanceService,
        user_service_1.UserService,
        upload_service_1.UploadService,
        badWords_service_1.BadWordsService,
        autoreply_service_1.AutoreplyService,
        globalConfig_service_1.GlobalConfigService,
        chatGroup_service_1.ChatGroupService,
        models_service_1.ModelsService,
        openaiDraw_service_1.OpenAIDrawService,
        lumaVideo_service_1.LumaVideoService,
        cogVideo_service_1.CogVideoService,
        fluxDraw_service_1.FluxDrawService,
        aiPPT_1.AiPptService,
        netSearch_service_1.netSearchService])
], ChatService);
exports.ChatService = ChatService;
