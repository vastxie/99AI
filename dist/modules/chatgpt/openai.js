"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getTokenCount = exports.sendMessageFromOpenAi = void 0;
const axios_1 = require("axios");
const tiktoken_1 = require("@dqbd/tiktoken");
const utils_1 = require("../../common/utils");
const tokenizer = (0, tiktoken_1.get_encoding)('cl100k_base');
function getFullUrl(proxyUrl) {
    const processedUrl = proxyUrl.endsWith('/') ? proxyUrl.slice(0, -1) : proxyUrl;
    const baseUrl = processedUrl || 'https://api.openai.com';
    return `${baseUrl}/v1/chat/completions`;
}
function sendMessageFromOpenAi(messagesHistory, inputs) {
    var _a;
    const { onProgress, maxToken, apiKey, model, temperature = 0.95, proxyUrl } = inputs;
    console.log('current request options: ', apiKey, model, maxToken, proxyUrl);
    const max_tokens = compilerToken(model, maxToken);
    const options = {
        method: 'POST',
        url: getFullUrl(proxyUrl),
        responseType: 'stream',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${(0, utils_1.removeSpecialCharacters)(apiKey)}`,
        },
        data: {
            max_tokens,
            stream: true,
            temperature,
            model,
            messages: messagesHistory
        },
    };
    const prompt = (_a = messagesHistory[messagesHistory.length - 1]) === null || _a === void 0 ? void 0 : _a.content;
    return new Promise(async (resolve, reject) => {
        try {
            const response = await (0, axios_1.default)(options);
            const stream = response.data;
            let result = { text: '' };
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
                    if (data === '[DONE]' || ISEND) {
                        result.text = result.text.trim();
                        return result;
                    }
                    try {
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
                    catch (error) {
                        console.log('parse Error', data);
                    }
                }
            });
            stream.on('end', () => {
                if (result.detail && result.text) {
                    const promptTokens = getTokenCount(prompt);
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
exports.sendMessageFromOpenAi = sendMessageFromOpenAi;
function getTokenCount(text) {
    if (!text)
        return 0;
    text = text.replace(/<\|endoftext\|>/g, '');
    return tokenizer.encode(text).length;
}
exports.getTokenCount = getTokenCount;
function compilerToken(model, maxToken) {
    let max = 0;
    if (model.includes(3.5)) {
        max = maxToken > 4096 ? 4096 : maxToken;
    }
    if (model.includes('gpt-4')) {
        max = maxToken > 8192 ? 8192 : maxToken;
    }
    if (model.includes('preview')) {
        max = maxToken > 4096 ? 4096 : maxToken;
    }
    if (model.includes('32k')) {
        max = maxToken > 32768 ? 32768 : maxToken;
    }
    return max;
}
