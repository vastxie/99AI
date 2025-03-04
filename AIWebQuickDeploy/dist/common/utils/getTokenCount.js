"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getTokenCount = void 0;
const gpt_tokenizer_1 = require("gpt-tokenizer");
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
    return (0, gpt_tokenizer_1.encode)(text).length;
};
exports.getTokenCount = getTokenCount;
