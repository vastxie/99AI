"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getTokenCount = exports.sendMessageFromOpenAi = void 0;
const axios_1 = require("axios");
const tiktoken_1 = require("@dqbd/tiktoken");
const common_1 = require("@nestjs/common");
const uuid = require("uuid");
const tokenizer = (0, tiktoken_1.get_encoding)('cl100k_base');
function getFullUrl(proxyUrl) {
    const processedUrl = proxyUrl.endsWith('/') ? proxyUrl.slice(0, -1) : proxyUrl;
    const baseUrl = processedUrl || 'https://api.openai.com';
    return `${baseUrl}/v1/chat/completions`;
}
async function sendMessageFromOpenAi(messagesHistory, inputs, uploadService) {
    var _a, _b, _c, _d;
    const { onProgress, maxToken, apiKey, model, temperature = 0.8, proxyUrl, prompt } = inputs;
    if (model.includes('dall')) {
        let result = { text: '', fileInfo: '' };
        try {
            const options = {
                method: 'POST',
                url: `${proxyUrl}/v1/images/generations`,
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${apiKey}`,
                },
                data: {
                    prompt: prompt,
                    model: model,
                    response_format: 'b64_json'
                },
            };
            const response = await (0, axios_1.default)(options);
            const { b64_json, revised_prompt } = response.data.data[0];
            const buffer = Buffer.from(b64_json, 'base64');
            let imgUrl = '';
            try {
                const filename = uuid.v4().slice(0, 10) + '.png';
                common_1.Logger.debug(`------> 开始上传图片！！！`, 'MidjourneyService');
                const buffer = Buffer.from(b64_json, 'base64');
                imgUrl = await uploadService.uploadFile({ filename, buffer });
                common_1.Logger.debug(`图片上传成功，URL: ${imgUrl}`, 'MidjourneyService');
            }
            catch (error) {
                common_1.Logger.error(`上传图片过程中出现错误: ${error}`, 'MidjourneyService');
            }
            result.fileInfo = imgUrl;
            result.text = revised_prompt;
            onProgress && onProgress({ text: result.text });
            return result;
        }
        catch (error) {
            const status = ((_a = error === null || error === void 0 ? void 0 : error.response) === null || _a === void 0 ? void 0 : _a.status) || 500;
            console.log('openai-draw error: ', JSON.stringify(error), status);
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
    else {
        let result = { text: '' };
        const options = {
            method: 'POST',
            url: getFullUrl(proxyUrl),
            responseType: 'stream',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${apiKey}`,
            },
            data: {
                stream: true,
                temperature,
                model,
                messages: messagesHistory,
            },
        };
        if (model === 'gpt-4-vision-preview') {
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
                messagesHistory.forEach(message => {
                    totalText += message.content + ' ';
                });
                stream.on('end', () => {
                    if (result.detail && result.text) {
                        const promptTokens = getTokenCount(totalText);
                        const completionTokens = getTokenCount(result.text);
                        result.detail.usage = {
                            prompt_tokens: promptTokens,
                            completion_tokens: completionTokens,
                            total_tokens: promptTokens + completionTokens,
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
}
exports.sendMessageFromOpenAi = sendMessageFromOpenAi;
function getTokenCount(text) {
    if (!text)
        return 0;
    if (typeof text !== 'string') {
        text = String(text);
    }
    text = text.replace(/<\|endoftext\|>/g, '');
    return tokenizer.encode(text).length;
}
exports.getTokenCount = getTokenCount;
