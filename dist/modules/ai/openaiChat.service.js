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
Object.defineProperty(exports, "__esModule", { value: true });
exports.OpenAIChatService = void 0;
const utils_1 = require("../../common/utils");
const common_1 = require("@nestjs/common");
const axios_1 = require("axios");
const globalConfig_service_1 = require("../globalConfig/globalConfig.service");
let OpenAIChatService = class OpenAIChatService {
    constructor(globalConfigService) {
        this.globalConfigService = globalConfigService;
    }
    async openAIChat(messagesHistory, inputs) {
        const { onFailure, onProgress, apiKey, model, proxyUrl, modelName, timeout, chatId, isFileUpload, modelAvatar, temperature, abortController, } = inputs;
        let result = {
            text: '',
            model: '',
            modelName: modelName,
            chatId: chatId,
            answer: '',
            errMsg: '',
            modelAvatar: modelAvatar,
        };
        const data = Object.assign({ model, messages: messagesHistory }, (isFileUpload === 2 && { max_tokens: 2048 }));
        data.stream = true;
        data.temperature = temperature;
        const options = {
            method: 'POST',
            url: `${proxyUrl}/v1/chat/completions`,
            responseType: 'stream',
            timeout: timeout,
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${apiKey}`,
            },
            data: data,
        };
        const sanitizedOptions = await this.sanitizeOptionsForLogging(options);
        console.log('请求配置:', JSON.stringify(sanitizedOptions, null, 2), 'ChatService');
        console.log('请求配置:', JSON.stringify(sanitizedOptions, null, 2), 'ChatService');
        try {
            const response = await (0, axios_1.default)(options);
            const stream = response.data;
            let buffer = '';
            await new Promise((resolve, reject) => {
                stream.on('data', (chunk) => {
                    buffer += chunk.toString();
                    let lines = buffer.split('\n');
                    buffer = lines.pop();
                    lines.forEach((line) => {
                        var _a, _b;
                        if (line.trim() === 'data: [DONE]') {
                            console.log('处理结束信号 [DONE]');
                            resolve(result);
                            return;
                        }
                        if (line.startsWith('data: ')) {
                            try {
                                const cleanedLine = line.slice(6).trim();
                                if (cleanedLine) {
                                    const jsonLine = JSON.parse(cleanedLine);
                                    const content = ((_b = (_a = jsonLine.choices[0]) === null || _a === void 0 ? void 0 : _a.delta) === null || _b === void 0 ? void 0 : _b.content) || '';
                                    result.answer += content;
                                    onProgress === null || onProgress === void 0 ? void 0 : onProgress({ text: content, answer: result.answer });
                                }
                            }
                            catch (error) {
                                console.error('Error parsing line:', line, error);
                            }
                        }
                    });
                });
                stream.on('end', () => {
                    resolve(result);
                });
                stream.on('error', (error) => {
                    reject(error);
                });
                abortController.signal.addEventListener('abort', () => {
                    resolve(result);
                });
            });
            return result;
        }
        catch (error) {
            result.errMsg = (0, utils_1.handleError)(error);
            common_1.Logger.error(result.errMsg);
            onFailure(result);
            return result;
        }
    }
    async sanitizeOptionsForLogging(options) {
        const sanitizedOptions = JSON.parse(JSON.stringify(options));
        if (sanitizedOptions.headers && sanitizedOptions.headers.Authorization) {
            const authHeader = sanitizedOptions.headers.Authorization;
            if (authHeader.startsWith('Bearer ')) {
                const token = authHeader.slice(7);
                if (token.length > 10) {
                    sanitizedOptions.headers.Authorization = `Bearer ${token.slice(0, 5)}****${token.slice(-4)}`;
                }
            }
        }
        if (sanitizedOptions.data &&
            sanitizedOptions.data.messages &&
            Array.isArray(sanitizedOptions.data.messages)) {
            sanitizedOptions.data.messages = sanitizedOptions.data.messages.map((message) => {
                if (message.content && Array.isArray(message.content)) {
                    message.content = message.content.map((content) => {
                        if (content.type === 'image_url' &&
                            content.image_url &&
                            content.image_url.url) {
                            content.image_url.url = 'data:image/***;base64 ... ...';
                        }
                        return content;
                    });
                }
                return message;
            });
        }
        return sanitizedOptions;
    }
    async chatFree(prompt, systemMessage, messagesHistory) {
        const { openaiBaseUrl = '', openaiBaseKey = '', openaiBaseModel, } = await this.globalConfigService.getConfigs([
            'openaiBaseKey',
            'openaiBaseUrl',
            'openaiBaseModel',
        ]);
        const key = openaiBaseKey;
        const proxyUrl = openaiBaseUrl;
        let requestData = [];
        if (systemMessage) {
            requestData.push({
                role: 'system',
                content: systemMessage,
            });
        }
        if (messagesHistory && messagesHistory.length > 0) {
            requestData = requestData.concat(messagesHistory);
        }
        else {
            requestData.push({
                role: 'user',
                content: prompt,
            });
        }
        const options = {
            method: 'POST',
            url: `${proxyUrl}/v1/chat/completions`,
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${key}`,
            },
            data: {
                model: openaiBaseModel || 'gpt-3.5-turbo-0125',
                messages: requestData,
            },
        };
        try {
            const response = await (0, axios_1.default)(options);
            common_1.Logger.log(`全局模型调用成功, 返回结果: ${response === null || response === void 0 ? void 0 : response.data.choices[0].message.content}`, 'ChatService');
            return response === null || response === void 0 ? void 0 : response.data.choices[0].message.content;
        }
        catch (error) {
            console.log('error: ', error);
        }
    }
};
OpenAIChatService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [globalConfig_service_1.GlobalConfigService])
], OpenAIChatService);
exports.OpenAIChatService = OpenAIChatService;
