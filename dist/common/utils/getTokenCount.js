"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getTokenCount = void 0;
const tiktoken_1 = require("@dqbd/tiktoken");
const getTokenCount = async (input) => {
    let text = '';
    if (Array.isArray(input)) {
        text = input.reduce((pre, cur) => {
            if (Array.isArray(cur.content)) {
                const contentText = cur.content
                    .filter((item) => item.type === 'text')
                    .map((item) => item.text)
                    .join(' ');
                return pre + contentText;
            }
            else {
                return pre + (cur.content || '');
            }
        }, '');
    }
    else if (typeof input === 'string') {
        text = input;
    }
    else if (input) {
        text = String(input);
    }
    text = text.replace(/<\|endoftext\|>/g, '');
    const tokenizer = (0, tiktoken_1.get_encoding)('cl100k_base');
    return tokenizer.encode(text).length;
};
exports.getTokenCount = getTokenCount;
