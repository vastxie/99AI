"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendMessageFromZhipu = exports.compilerStream = exports.compilerMetaJsonStr = exports.generateToken = void 0;
const axios = require('axios');
const jwt = require('jsonwebtoken');
function generateToken(apikey, expSeconds = 1000 * 60 * 60 * 24 * 360) {
    const [id, secret] = apikey.split('.');
    const payload = {
        api_key: id,
        exp: Math.round(Date.now()) + expSeconds * 1000,
        timestamp: Math.round(Date.now()),
    };
    return jwt.sign(payload, secret, { algorithm: 'HS256', header: { alg: 'HS256', sign_type: 'SIGN' } });
}
exports.generateToken = generateToken;
function compilerMetaJsonStr(data) {
    let jsonStr = {};
    try {
        jsonStr = JSON.parse(data);
    }
    catch (error) {
        jsonStr = {
            usage: {
                completion_tokens: 49,
                prompt_tokens: 333,
                total_tokens: 399
            },
        };
        console.error('json parse error from zhipu!', data);
    }
    return jsonStr;
}
exports.compilerMetaJsonStr = compilerMetaJsonStr;
function compilerStream(streamArr) {
    var _a;
    if (streamArr.length === 3) {
        return {
            event: streamArr[0].replace('event:', ''),
            id: streamArr[1].replace('id:', ''),
            is_end: false,
            result: streamArr[2].replace('data:', '').trim()
        };
    }
    if (streamArr.length === 4) {
        return {
            event: streamArr[0].replace('event:', ''),
            id: streamArr[1].replace('id:', ''),
            result: streamArr[2].replace('data:', '').trim(),
            is_end: true,
            usage: (_a = compilerMetaJsonStr(streamArr[3].replace('meta:', ''))) === null || _a === void 0 ? void 0 : _a.usage
        };
    }
}
exports.compilerStream = compilerStream;
async function sendMessageFromZhipu(messagesHistory, { onProgress, key, model, temperature = 0.95 }) {
    const token = await generateToken(key);
    return new Promise((resolve, reject) => {
        const url = `https://open.bigmodel.cn/api/paas/v3/model-api/${model}/sse-invoke`;
        const options = {
            method: 'POST',
            url,
            responseType: 'stream',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': token
            },
            data: {
                prompt: messagesHistory,
                temperature
            }
        };
        axios(options)
            .then(response => {
            const stream = response.data;
            let resData;
            let cacheResText = '';
            stream.on('data', chunk => {
                const stramArr = chunk.toString().split("\n").filter((line) => line.trim() !== "");
                const parseData = compilerStream(stramArr);
                if (!parseData)
                    return;
                const { id, result, is_end } = parseData;
                result && (cacheResText += result.trim());
                if (is_end) {
                    parseData.is_end = false;
                    resData = parseData;
                    resData.text = cacheResText;
                }
                onProgress(parseData);
            });
            stream.on('end', () => {
                resolve(resData);
                cacheResText = '';
            });
        })
            .catch(error => {
            console.log('error: ', error);
        });
    });
}
exports.sendMessageFromZhipu = sendMessageFromZhipu;
