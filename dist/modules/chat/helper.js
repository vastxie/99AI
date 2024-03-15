"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.addOneIfOdd = exports.unifiedFormattingResponse = void 0;
function unifiedFormattingResponse(keyType, response, others) {
    let formatRes = {
        keyType,
        parentMessageId: '',
        text: '',
        usage: {
            prompt_tokens: 0,
            completion_tokens: 0,
            total_tokens: 0,
        }
    };
    const { parentMessageId } = response === null || response === void 0 ? void 0 : response.detail;
    let { usage } = response === null || response === void 0 ? void 0 : response.detail;
    if (!usage) {
        usage = {
            prompt_tokens: 0,
            completion_tokens: 0,
            total_tokens: 0
        };
    }
    const { prompt_tokens, completion_tokens, total_tokens } = usage;
    formatRes = {
        keyType,
        parentMessageId,
        text: response.text,
        usage: {
            prompt_tokens,
            completion_tokens,
            total_tokens
        }
    };
    return formatRes;
}
exports.unifiedFormattingResponse = unifiedFormattingResponse;
function addOneIfOdd(num) {
    if (num % 2 !== 0) {
        return num + 1;
    }
    else {
        return num;
    }
}
exports.addOneIfOdd = addOneIfOdd;
