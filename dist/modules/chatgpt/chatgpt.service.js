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
exports.ChatgptService = void 0;
const upload_service_1 = require("./../upload/upload.service");
const user_service_1 = require("./../user/user.service");
const nestjs_config_1 = require("nestjs-config");
const common_1 = require("@nestjs/common");
const errorMessage_constant_1 = require("../../common/constants/errorMessage.constant");
const utils_1 = require("../../common/utils");
const axios_1 = require("axios");
const userBalance_service_1 = require("../userBalance/userBalance.service");
const balance_constant_1 = require("../../common/constants/balance.constant");
const chatLog_service_1 = require("../chatLog/chatLog.service");
const uuid = require("uuid");
const config_entity_1 = require("../globalConfig/config.entity");
const typeorm_1 = require("typeorm");
const typeorm_2 = require("@nestjs/typeorm");
const badwords_service_1 = require("../badwords/badwords.service");
const autoreply_service_1 = require("../autoreply/autoreply.service");
const gptkeys_entity_1 = require("./gptkeys.entity");
const globalConfig_service_1 = require("../globalConfig/globalConfig.service");
const fanyi_service_1 = require("../fanyi/fanyi.service");
const app_entity_1 = require("../app/app.entity");
const chatGroup_service_1 = require("../chatGroup/chatGroup.service");
const models_service_1 = require("../models/models.service");
const baidu_1 = require("./baidu");
const helper_1 = require("./helper");
const store_1 = require("./store");
const zhipu_1 = require("./zhipu");
const openai_1 = require("./openai");
const chatBoxType_entity_1 = require("./chatBoxType.entity");
const chatBox_entity_1 = require("./chatBox.entity");
const chatPre_entity_1 = require("./chatPre.entity");
const chatPreType_entity_1 = require("./chatPreType.entity");
let ChatgptService = class ChatgptService {
    constructor(gptKeysEntity, configEntity, chatBoxTypeEntity, chatBoxEntity, appEntity, chatPreTypeEntity, chatPreEntity, configService, userBalanceService, chatLogService, userService, uploadService, badwordsService, autoreplyService, globalConfigService, fanyiService, chatGroupService, modelsService) {
        this.gptKeysEntity = gptKeysEntity;
        this.configEntity = configEntity;
        this.chatBoxTypeEntity = chatBoxTypeEntity;
        this.chatBoxEntity = chatBoxEntity;
        this.appEntity = appEntity;
        this.chatPreTypeEntity = chatPreTypeEntity;
        this.chatPreEntity = chatPreEntity;
        this.configService = configService;
        this.userBalanceService = userBalanceService;
        this.chatLogService = chatLogService;
        this.userService = userService;
        this.uploadService = uploadService;
        this.badwordsService = badwordsService;
        this.autoreplyService = autoreplyService;
        this.globalConfigService = globalConfigService;
        this.fanyiService = fanyiService;
        this.chatGroupService = chatGroupService;
        this.modelsService = modelsService;
        this.nineStore = null;
        this.whiteListUser = [];
        this.keyPool = {
            list3: [],
            list4: [],
        };
    }
    async onModuleInit() {
        let chatgpt = await (0, utils_1.importDynamic)('chatgpt-nine-ai');
        let KeyvRedis = await (0, utils_1.importDynamic)('@keyv/redis');
        let Keyv = await (0, utils_1.importDynamic)('keyv');
        chatgpt = (chatgpt === null || chatgpt === void 0 ? void 0 : chatgpt.default) ? chatgpt.default : chatgpt;
        KeyvRedis = (KeyvRedis === null || KeyvRedis === void 0 ? void 0 : KeyvRedis.default) ? KeyvRedis.default : KeyvRedis;
        Keyv = (Keyv === null || Keyv === void 0 ? void 0 : Keyv.default) ? Keyv.default : Keyv;
        const { ChatGPTAPI, ChatGPTError, ChatGPTUnofficialProxyAPI } = chatgpt;
        const port = +process.env.REDIS_PORT;
        const host = process.env.REDIS_HOST;
        const password = process.env.REDIS_PASSWORD;
        const username = process.env.REDIS_USER;
        const redisUrl = `redis://${username || ''}:${password || ''}@${host}:${port}`;
        const store = new KeyvRedis(redisUrl);
        const messageStore = new Keyv({ store, namespace: 'nineai-chatlog' });
        this.nineStore = new store_1.NineStore({ store: messageStore, namespace: 'chat' });
    }
    async getRequestParams(inputOpt, systemMessage, currentRequestModelKey, modelInfo = null) {
        var _a;
        if (!modelInfo) {
            modelInfo = (_a = (await this.modelsService.getBaseConfig())) === null || _a === void 0 ? void 0 : _a.modelInfo;
        }
        const { timeout = 60 } = currentRequestModelKey;
        const { topN: temperature, model } = modelInfo;
        const { parentMessageId = 0 } = inputOpt;
        const globalTimeoutMs = await this.globalConfigService.getConfigs(['openaiTimeoutMs']);
        const timeoutMs = timeout * 1000 || globalTimeoutMs || 100 * 1000;
        const options = {
            parentMessageId,
            timeoutMs: +timeoutMs,
            completionParams: {
                model,
                temperature: temperature,
            },
        };
        systemMessage && (options.systemMessage = systemMessage);
        return options;
    }
    async chatSyncFree(prompt) {
        const currentRequestModelKey = await this.modelsService.getRandomDrawKey();
        const systemMessage = await this.globalConfigService.getConfigs(['systemPreMessage']);
        const { maxModelTokens = 8000, maxResponseTokens = 4096, key, model } = currentRequestModelKey;
        const proxyUrl = await this.getModelProxyUrl(currentRequestModelKey);
        const { context: messagesHistory } = await this.nineStore.buildMessageFromParentMessageId(prompt, { parentMessageId: '', systemMessage });
        try {
            const response = await (0, openai_1.sendMessageFromOpenAi)(messagesHistory, {
                apiKey: (0, utils_1.removeSpecialCharacters)(key),
                model,
                proxyUrl: proxyUrl,
                onProgress: null,
            });
            return response === null || response === void 0 ? void 0 : response.text;
        }
        catch (error) {
            console.log('error: ', error);
        }
    }
    async chatProcess(body, req, res) {
        var _a, _b, _c;
        const abortController = req.abortController;
        const { options = {}, appId, cusromPrompt, systemMessage = '' } = body;
        let setSystemMessage = systemMessage;
        const { parentMessageId } = options;
        const { prompt } = body;
        const { groupId, usingNetwork } = options;
        const groupInfo = await this.chatGroupService.getGroupInfoFromId(groupId);
        const groupConfig = (groupInfo === null || groupInfo === void 0 ? void 0 : groupInfo.config) ? JSON.parse(groupInfo.config) : await this.modelsService.getBaseConfig();
        const { keyType, model, topN: temperature, systemMessage: customSystemMessage, rounds } = groupConfig.modelInfo;
        let currentRequestModelKey = null;
        if (!cusromPrompt) {
            currentRequestModelKey = await this.modelsService.getCurrentModelKeyInfo(model);
        }
        else {
            currentRequestModelKey = await this.modelsService.getRandomDrawKey();
        }
        if (!currentRequestModelKey) {
            throw new common_1.HttpException('当前流程所需要的模型已被管理员下架、请联系管理员上架专属模型！', common_1.HttpStatus.BAD_REQUEST);
        }
        const { deduct, deductType, key: modelKey, secret, modelName, id: keyId, accessToken } = currentRequestModelKey;
        await this.userService.checkUserStatus(req.user);
        await this.userBalanceService.validateBalance(req, deductType === 1 ? 'model3' : 'model4', deduct);
        res && res.setHeader('Content-type', 'application/octet-stream; charset=utf-8');
        await this.badwordsService.checkBadWords(prompt, req.user.id);
        const autoReplyRes = await this.autoreplyService.checkAutoReply(prompt);
        if (autoReplyRes && res) {
            const msg = { message: autoReplyRes, code: 500 };
            res.write(JSON.stringify(msg));
            return res.end();
        }
        if (appId) {
            const appInfo = await this.appEntity.findOne({ where: { id: appId, status: (0, typeorm_1.In)([1, 3, 4, 5]) } });
            if (!appInfo) {
                throw new common_1.HttpException('你当前使用的应用已被下架、请删除当前对话开启新的对话吧！', common_1.HttpStatus.BAD_REQUEST);
            }
            appInfo.preset && (setSystemMessage = appInfo.preset);
        }
        else if (cusromPrompt) {
            setSystemMessage = systemMessage;
        }
        else if (customSystemMessage) {
            setSystemMessage = customSystemMessage;
        }
        else {
            const currentDate = new Date().toISOString().split('T')[0];
            const systemPreMessage = await this.globalConfigService.getConfigs(['systemPreMessage']);
            setSystemMessage = systemPreMessage + `\n Current date: ${currentDate}`;
        }
        let netWorkPrompt = '';
        if (usingNetwork) {
            netWorkPrompt = await (0, utils_1.compileNetwork)(prompt);
            const currentDate = new Date().toISOString().split('T')[0];
            const systemPreMessage = await this.globalConfigService.getConfigs(['systemPreMessage']);
            setSystemMessage = systemPreMessage + `\n Current date: ${currentDate}`;
        }
        const mergedOptions = await this.getRequestParams(options, setSystemMessage, currentRequestModelKey, groupConfig.modelInfo);
        const { maxModelTokens = 8000, maxResponseTokens = 4096, key } = currentRequestModelKey;
        res && res.status(200);
        let response = null;
        let othersInfo = null;
        try {
            if (res) {
                let lastChat = null;
                let isSuccess = false;
                res.on('close', async () => {
                    if (isSuccess)
                        return;
                    abortController.abort();
                    const prompt_tokens = (await (0, openai_1.getTokenCount)(prompt)) || 0;
                    const completion_tokens = (await (0, openai_1.getTokenCount)(lastChat === null || lastChat === void 0 ? void 0 : lastChat.text)) || 0;
                    const total_tokens = prompt_tokens + completion_tokens;
                    const curIp = (0, utils_1.getClientIp)(req);
                    await this.chatLogService.saveChatLog({
                        appId,
                        curIp,
                        userId: req.user.id,
                        type: balance_constant_1.DeductionKey.CHAT_TYPE,
                        prompt,
                        answer: '',
                        promptTokens: prompt_tokens,
                        completionTokens: 0,
                        totalTokens: prompt_tokens,
                        model: model,
                        role: 'user',
                        groupId,
                        requestOptions: JSON.stringify({
                            options: null,
                            prompt,
                        }),
                    });
                    await this.chatLogService.saveChatLog({
                        appId,
                        curIp,
                        userId: req.user.id,
                        type: balance_constant_1.DeductionKey.CHAT_TYPE,
                        prompt: prompt,
                        answer: lastChat === null || lastChat === void 0 ? void 0 : lastChat.text,
                        promptTokens: prompt_tokens,
                        completionTokens: completion_tokens,
                        totalTokens: total_tokens,
                        model: model,
                        role: 'assistant',
                        groupId,
                        requestOptions: JSON.stringify({
                            options: {
                                model: model,
                                temperature,
                            },
                            prompt,
                        }),
                        conversationOptions: JSON.stringify({
                            conversationId: lastChat === null || lastChat === void 0 ? void 0 : lastChat.conversationId,
                            model: model,
                            parentMessageId: lastChat === null || lastChat === void 0 ? void 0 : lastChat.id,
                            temperature,
                        }),
                    });
                    await this.userBalanceService.deductFromBalance(req.user.id, `model${deductType === 1 ? 3 : 4}`, deduct, total_tokens);
                });
                if (Number(keyType) === 1) {
                    const { key, maxToken, maxTokenRes, proxyResUrl } = await this.formatModelToken(currentRequestModelKey);
                    const { parentMessageId, completionParams, systemMessage } = mergedOptions;
                    const { model, temperature } = completionParams;
                    const { context: messagesHistory } = await this.nineStore.buildMessageFromParentMessageId(usingNetwork ? netWorkPrompt : prompt, {
                        parentMessageId,
                        systemMessage,
                        maxModelToken: maxToken,
                        maxResponseTokens: maxTokenRes,
                        maxRounds: (0, helper_1.addOneIfOdd)(rounds),
                    });
                    let firstChunk = true;
                    response = await (0, openai_1.sendMessageFromOpenAi)(messagesHistory, {
                        maxToken,
                        maxTokenRes,
                        apiKey: modelKey,
                        model,
                        temperature,
                        proxyUrl: proxyResUrl,
                        onProgress: (chat) => {
                            res.write(firstChunk ? JSON.stringify(chat) : `\n${JSON.stringify(chat)}`);
                            lastChat = chat;
                            firstChunk = false;
                        },
                    });
                    isSuccess = true;
                }
                if (Number(keyType) === 2) {
                    let firstChunk = true;
                    const { context: messagesHistory } = await this.nineStore.buildMessageFromParentMessageId(usingNetwork ? netWorkPrompt : prompt, {
                        parentMessageId,
                        maxRounds: (0, helper_1.addOneIfOdd)(rounds),
                    });
                    response = await (0, baidu_1.sendMessageFromBaidu)(usingNetwork ? netWorkPrompt : messagesHistory, {
                        temperature,
                        accessToken,
                        model,
                        onProgress: (data) => {
                            res.write(firstChunk ? JSON.stringify(data) : `\n${JSON.stringify(data)}`);
                            firstChunk = false;
                            lastChat = data;
                        },
                    });
                    isSuccess = true;
                }
                if (Number(keyType) === 3) {
                    let firstChunk = true;
                    const { context: messagesHistory } = await this.nineStore.buildMessageFromParentMessageId(usingNetwork ? netWorkPrompt : prompt, {
                        parentMessageId,
                        maxRounds: (0, helper_1.addOneIfOdd)(rounds),
                    });
                    response = await (0, zhipu_1.sendMessageFromZhipu)(usingNetwork ? netWorkPrompt : messagesHistory, {
                        temperature,
                        key,
                        model,
                        onProgress: (data) => {
                            res.write(firstChunk ? JSON.stringify(data) : `\n${JSON.stringify(data)}`);
                            firstChunk = false;
                            lastChat = data;
                        },
                    });
                    isSuccess = true;
                }
                const userMessageData = {
                    id: this.nineStore.getUuid(),
                    text: prompt,
                    role: 'user',
                    name: undefined,
                    usage: null,
                    parentMessageId: parentMessageId,
                    conversationId: response === null || response === void 0 ? void 0 : response.conversationId,
                };
                othersInfo = { model, parentMessageId };
                await this.nineStore.setData(userMessageData);
                const assistantMessageData = {
                    id: response.id,
                    text: response.text,
                    role: 'assistant',
                    name: undefined,
                    usage: response.usage,
                    parentMessageId: userMessageData.id,
                    conversationId: response === null || response === void 0 ? void 0 : response.conversationId,
                };
                await this.nineStore.setData(assistantMessageData);
                othersInfo = { model, parentMessageId: userMessageData.id };
            }
            else {
                const { key, maxToken, maxTokenRes, proxyResUrl } = await this.formatModelToken(currentRequestModelKey);
                const { parentMessageId, completionParams, systemMessage } = mergedOptions;
                const { model, temperature } = completionParams;
                const { context: messagesHistory } = await this.nineStore.buildMessageFromParentMessageId(usingNetwork ? netWorkPrompt : prompt, {
                    parentMessageId,
                    systemMessage,
                    maxRounds: (0, helper_1.addOneIfOdd)(rounds),
                });
                response = await (0, openai_1.sendMessageFromOpenAi)(messagesHistory, {
                    apiKey: modelKey,
                    model,
                    temperature,
                    proxyUrl: proxyResUrl,
                    onProgress: null,
                });
            }
            const formatResponse = await (0, helper_1.unifiedFormattingResponse)(keyType, response, othersInfo);
            const { prompt_tokens = 0, completion_tokens = 0, total_tokens = 0 } = formatResponse.usage;
            await this.userBalanceService.deductFromBalance(req.user.id, `model${deductType === 1 ? 3 : 4}`, deduct, total_tokens);
            await this.modelsService.saveUseLog(keyId, total_tokens);
            const curIp = (0, utils_1.getClientIp)(req);
            await this.chatLogService.saveChatLog({
                appId,
                curIp,
                userId: req.user.id,
                type: balance_constant_1.DeductionKey.CHAT_TYPE,
                prompt,
                answer: '',
                promptTokens: prompt_tokens,
                completionTokens: 0,
                totalTokens: total_tokens,
                model: formatResponse.model,
                role: 'user',
                groupId,
                requestOptions: JSON.stringify({
                    options: null,
                    prompt,
                }),
            });
            await this.chatLogService.saveChatLog({
                appId,
                curIp,
                userId: req.user.id,
                type: balance_constant_1.DeductionKey.CHAT_TYPE,
                prompt: prompt,
                answer: formatResponse === null || formatResponse === void 0 ? void 0 : formatResponse.text,
                promptTokens: prompt_tokens,
                completionTokens: completion_tokens,
                totalTokens: total_tokens,
                model: model,
                role: 'assistant',
                groupId,
                requestOptions: JSON.stringify({
                    options: {
                        model: model,
                        temperature,
                    },
                    prompt,
                }),
                conversationOptions: JSON.stringify({
                    conversationId: response.conversationId,
                    model: model,
                    parentMessageId: response.id,
                    temperature,
                }),
            });
            common_1.Logger.debug(`本次调用: ${req.user.id} model: ${model} key -> ${key}, 模型名称: ${modelName}, 最大回复token: ${maxResponseTokens}`, 'ChatgptService');
            const userBalance = await this.userBalanceService.queryUserBalance(req.user.id);
            response.userBanance = Object.assign({}, userBalance);
            response.result && (response.result = '');
            response.is_end = true;
            if (res) {
                return res.write(`\n${JSON.stringify(response)}`);
            }
            else {
                return response.text;
            }
        }
        catch (error) {
            console.log('chat-error <----------------------------------------->', modelKey, error);
            const code = (error === null || error === void 0 ? void 0 : error.statusCode) || 400;
            const status = ((_a = error === null || error === void 0 ? void 0 : error.response) === null || _a === void 0 ? void 0 : _a.status) || (error === null || error === void 0 ? void 0 : error.statusCode) || 400;
            console.log('chat-error-detail  <----------------------------------------->', 'code: ', code, 'message', error === null || error === void 0 ? void 0 : error.message, 'statusText:', (_b = error === null || error === void 0 ? void 0 : error.response) === null || _b === void 0 ? void 0 : _b.statusText, 'status', (_c = error === null || error === void 0 ? void 0 : error.response) === null || _c === void 0 ? void 0 : _c.status);
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
            if ((error === null || error === void 0 ? void 0 : error.message.includes('The OpenAI account associated with this API key has been deactivated.')) && Number(keyType) === 1) {
                await this.modelsService.lockKey(keyId, '当前模型key已被封禁、已冻结当前调用Key、尝试重新对话试试吧！', -1);
                message = '当前模型key已被封禁';
            }
            if ((error === null || error === void 0 ? void 0 : error.statusCode) === 429 && error.message.includes('billing') && Number(keyType) === 1) {
                await this.modelsService.lockKey(keyId, '当前模型key余额已耗尽、已冻结当前调用Key、尝试重新对话试试吧！', -3);
                message = '当前模型key余额已耗尽';
            }
            if ((error === null || error === void 0 ? void 0 : error.statusCode) === 429 && (error === null || error === void 0 ? void 0 : error.statusText) === 'Too Many Requests') {
                message = '当前模型调用过于频繁、请重新试试吧！';
            }
            if ((error === null || error === void 0 ? void 0 : error.statusCode) === 401 && error.message.includes('Incorrect API key provided') && Number(keyType) === 1) {
                await this.modelsService.lockKey(keyId, '提供了错误的模型秘钥', -2);
                message = '提供了错误的模型秘钥、已冻结当前调用Key、请重新尝试对话！';
            }
            if ((error === null || error === void 0 ? void 0 : error.statusCode) === 404 && error.message.includes('This is not a chat model and thus not supported') && Number(keyType) === 1) {
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
        const money = (body === null || body === void 0 ? void 0 : body.quality) === 'hd' ? 4 : 2;
        await this.userBalanceService.validateBalance(req, 'mjDraw', money);
        let images = [];
        const detailKeyInfo = await this.modelsService.getRandomDrawKey();
        const keyId = detailKeyInfo === null || detailKeyInfo === void 0 ? void 0 : detailKeyInfo.id;
        const { key, proxyResUrl } = await this.formatModelToken(detailKeyInfo);
        common_1.Logger.log(`draw paompt info <==**==> ${body.prompt}, key ===> ${key}`, 'DrawService');
        try {
            const api = `${proxyResUrl}/v1/images/generations`;
            const params = Object.assign(Object.assign({}, body), { model: 'dall-e-3' });
            console.log('dall-e draw params: ', params);
            const res = await axios_1.default.post(api, Object.assign(Object.assign({}, params), { response_format: 'b64_json' }), { headers: { Authorization: `Bearer ${key}` } });
            images = res.data.data;
            const task = [];
            for (const item of images) {
                const filename = uuid.v4().slice(0, 10) + '.png';
                const buffer = Buffer.from(item.b64_json, 'base64');
                task.push(this.uploadService.uploadFile({ filename, buffer }));
            }
            const urls = await Promise.all(task);
            await this.userBalanceService.deductFromBalance(req.user.id, 'mjDraw', (params === null || params === void 0 ? void 0 : params.quality) === 'standard' ? 2 : 4, money);
            const curIp = (0, utils_1.getClientIp)(req);
            const taskLog = [];
            const cosType = await this.uploadService.getUploadType();
            const [width, height] = body.size.split('x');
            urls.forEach((url) => {
                taskLog.push(this.chatLogService.saveChatLog({
                    curIp,
                    userId: req.user.id,
                    type: balance_constant_1.DeductionKey.PAINT_TYPE,
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
    async getAllKeyList() {
        const list = await this.gptKeysEntity.find({
            where: { status: 1 },
            select: ['id', 'key', 'weight', 'model', 'maxModelTokens', 'maxResponseTokens', 'openaiProxyUrl', 'openaiTimeoutMs'],
        });
        const list3 = list.filter((t) => t.model.includes('gpt-3'));
        const list4 = list.filter((t) => t.model.includes('gpt-4'));
        this.keyPool = {
            list3,
            list4,
        };
    }
    async getModelProxyUrl(modelKey) {
        const openaiBaseUrl = await this.globalConfigService.getConfigs(['openaiBaseUrl']);
        return (modelKey === null || modelKey === void 0 ? void 0 : modelKey.proxyUrl) || openaiBaseUrl || 'https://api.openai.com';
    }
    async formatModelToken(detailKeyInfo) {
        const { openaiModel3MaxTokens = 0, openaiModel3MaxTokensRes = 0, openaiModel3MaxTokens16k = 0, openaiModel3MaxTokens16kRes = 0, openaiModel4MaxTokens = 0, openaiModel4MaxTokensRes = 0, openaiModel4MaxTokens32k = 0, openaiModel4MaxTokens32kRes = 0, openaiBaseUrl = '', } = await this.globalConfigService.getConfigs([
            'openaiModel3MaxTokens',
            'openaiModel3MaxTokensRes',
            'openaiModel3MaxTokens16k',
            'openaiModel3MaxTokens16kRes',
            'openaiModel4MaxTokens',
            'openaiModel4MaxTokensRes',
            'openaiModel4MaxTokens32k',
            'openaiModel4MaxTokens32kRes',
            'openaiBaseUrl',
        ]);
        let maxToken = null;
        let maxTokenRes = null;
        let proxyResUrl = null;
        let { model, maxModelTokens = 0, maxResponseTokens = 0, proxyUrl = '', key } = detailKeyInfo;
        if (model.toLowerCase().includes('gpt-4')) {
            maxModelTokens >= 8192 && (maxModelTokens = 8192);
            maxTokenRes >= 4096 && (maxModelTokens = 4096);
            maxToken = maxModelTokens || openaiModel4MaxTokens || 8192;
            maxTokenRes = maxResponseTokens || openaiModel4MaxTokensRes || 4096;
            if (model.toLowerCase().includes('32k')) {
                maxModelTokens >= 32768 && (maxModelTokens = 32768);
                maxTokenRes >= 16384 && (maxModelTokens = 16384);
                maxToken = maxModelTokens || openaiModel4MaxTokens32k || 32768;
                maxTokenRes = maxResponseTokens || openaiModel4MaxTokens32kRes || 16384;
            }
            if (model.toLowerCase().includes('1106')) {
                maxModelTokens >= 16380 && (maxModelTokens = 16380);
                maxTokenRes >= 4096 && (maxModelTokens = 4096);
                maxToken = maxModelTokens || 16380;
                maxTokenRes = maxResponseTokens || 4096;
            }
        }
        if (model.toLowerCase().includes('gpt-3')) {
            maxModelTokens >= 4096 && (maxModelTokens = 4096);
            maxTokenRes >= 2000 && (maxModelTokens = 2000);
            maxToken = maxModelTokens || openaiModel3MaxTokens || 4096;
            maxTokenRes = maxResponseTokens || openaiModel3MaxTokensRes || 2000;
            if (model.toLowerCase().includes('16k')) {
                maxModelTokens >= 16384 && (maxModelTokens = 16384);
                maxTokenRes >= 8192 && (maxModelTokens = 8192);
                maxToken = maxModelTokens || openaiModel3MaxTokens16k || 16384;
                maxTokenRes = maxResponseTokens || openaiModel3MaxTokens16kRes || 8192;
            }
            if (model.toLowerCase().includes('1106')) {
                maxModelTokens >= 16384 && (maxModelTokens = 16384);
                maxTokenRes >= 4096 && (maxModelTokens = 4096);
                maxToken = maxModelTokens || 16384;
                maxTokenRes = maxResponseTokens || 4096;
            }
        }
        proxyResUrl = proxyUrl || openaiBaseUrl || 'https://api.openai.com';
        if (maxTokenRes >= maxToken) {
            maxTokenRes = Math.floor(maxToken / 2);
        }
        return {
            key,
            maxToken,
            maxTokenRes,
            proxyResUrl,
        };
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
    async getMaxTokenFromModelWithOpenAi(model, maxModelToken, maxResToken) {
        let maxToken = 4096;
        let maxRes = 2048;
        if (model.toLowerCase().includes('gpt-4')) {
            maxToken = maxModelToken >= 8196 ? 8196 : maxModelToken;
            maxRes = maxResToken >= 4096 ? 4096 : maxResToken;
            if (model.toLowerCase().includes('32k')) {
                maxToken = maxModelToken >= 32768 ? 32768 : maxModelToken;
                maxRes = maxResToken >= 16000 ? 16000 : maxResToken;
            }
            if (model.toLowerCase().includes('gpt-4-1106') || model.toLowerCase().includes('gpt-4-vision-preview')) {
                maxToken = maxModelToken >= 128000 ? 128000 : maxModelToken;
                maxRes = maxResToken >= 4096 ? 4096 : maxResToken;
            }
        }
        if (model.toLowerCase().includes('gpt-3')) {
            maxToken = maxModelToken >= 4096 ? 4096 : maxModelToken;
            maxRes = maxResToken >= 2048 ? 2048 : maxResToken;
            if (model.toLowerCase().includes('16k')) {
                maxToken = maxModelToken >= 16384 ? 16384 : maxModelToken;
                maxRes = maxResToken >= 8000 ? 8000 : maxResToken;
            }
            if (model.toLowerCase().includes('1106')) {
                maxToken = maxModelToken >= 16384 ? 16384 : maxModelToken;
                maxRes = maxResToken >= 8000 ? 8000 : maxResToken;
            }
        }
        return {
            maxToken,
            maxRes,
        };
    }
};
ChatgptService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, typeorm_2.InjectRepository)(gptkeys_entity_1.GptKeysEntity)),
    __param(1, (0, typeorm_2.InjectRepository)(config_entity_1.ConfigEntity)),
    __param(2, (0, typeorm_2.InjectRepository)(chatBoxType_entity_1.ChatBoxTypeEntity)),
    __param(3, (0, typeorm_2.InjectRepository)(chatBox_entity_1.ChatBoxEntity)),
    __param(4, (0, typeorm_2.InjectRepository)(app_entity_1.AppEntity)),
    __param(5, (0, typeorm_2.InjectRepository)(chatPreType_entity_1.ChatPreTypeEntity)),
    __param(6, (0, typeorm_2.InjectRepository)(chatPre_entity_1.ChatPreEntity)),
    __metadata("design:paramtypes", [typeorm_1.Repository,
        typeorm_1.Repository,
        typeorm_1.Repository,
        typeorm_1.Repository,
        typeorm_1.Repository,
        typeorm_1.Repository,
        typeorm_1.Repository,
        nestjs_config_1.ConfigService,
        userBalance_service_1.UserBalanceService,
        chatLog_service_1.ChatLogService,
        user_service_1.UserService,
        upload_service_1.UploadService,
        badwords_service_1.BadwordsService,
        autoreply_service_1.AutoreplyService,
        globalConfig_service_1.GlobalConfigService,
        fanyi_service_1.FanyiService,
        chatGroup_service_1.ChatGroupService,
        models_service_1.ModelsService])
], ChatgptService);
exports.ChatgptService = ChatgptService;
