"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.NineStore = void 0;
const uuid_1 = require("uuid");
const tiktoken_1 = require("@dqbd/tiktoken");
const common_1 = require("@nestjs/common");
const tokenizer = (0, tiktoken_1.get_encoding)('cl100k_base');
class NineStore {
    constructor(options) {
        const { store, namespace, expires } = this.formatOptions(options);
        this.store = store;
        this.namespace = namespace;
        this.expires = expires;
    }
    formatOptions(options) {
        const { store, expires = 1000 * 60 * 60 * 24 * 3, namespace = 'chat' } = options;
        return { store, namespace, expires };
    }
    generateKey(key) {
        return this.namespace ? `${this.namespace}-${key}` : key;
    }
    async getData(id) {
        const res = await this.store.get(id);
        return res;
    }
    async setData(message, expires = this.expires) {
        await this.store.set(message.id, message, expires);
    }
    async buildMessageFromParentMessageId(text, options) {
        let { maxRounds, maxModelToken, maxResponseTokens, systemMessage = '', name, fileInfo, model } = options;
        let { parentMessageId } = options;
        let messages = [];
        let nextNumTokensEstimate = 0;
        if (systemMessage) {
            const specialModels = ['gemini-pro', 'ERNIE', 'qwen', 'SparkDesk', 'hunyuan'];
            const isSpecialModel = model && specialModels.some(specialModel => model.includes(specialModel));
            if (isSpecialModel) {
                messages.push({ role: 'user', content: systemMessage, name });
                messages.push({ role: 'assistant', content: "好的", name });
            }
            else {
                messages.push({ role: 'system', content: systemMessage, name });
            }
        }
        const systemMessageOffset = messages.length;
        let round = 0;
        if (model === 'gpt-4-vision-preview' && fileInfo) {
            const content = [
                {
                    "type": "text",
                    "text": text
                },
                {
                    "type": "image_url",
                    "image_url": {
                        "url": fileInfo
                    }
                }
            ];
            messages.push({ role: 'user', content: content, name });
        }
        else {
            if (model === 'gpt-4-all' && fileInfo) {
                text = fileInfo + "\n" + text;
            }
            messages.push({ role: 'user', content: text, name });
        }
        common_1.Logger.debug(`发送的参数：${messages}`);
        let nextMessages = messages;
        do {
            if (!parentMessageId) {
                break;
            }
            const parentMessage = await this.getData(parentMessageId);
            if (!parentMessage) {
                break;
            }
            const { text, name, role, fileInfo } = parentMessage;
            let content = text;
            if (role === 'user' && fileInfo) {
                if (model === 'gpt-4-vision-preview') {
                    content = [
                        { "type": "text", "text": text },
                        { "type": "image_url", "image_url": { "url": fileInfo } }
                    ];
                }
                else if (model === 'gpt-4-all') {
                    content = fileInfo + "\n" + text;
                }
            }
            nextMessages = nextMessages.slice(0, systemMessageOffset).concat([
                { role, content, name },
                ...nextMessages.slice(systemMessageOffset)
            ]);
            round++;
            if (maxRounds && round >= maxRounds) {
                break;
            }
            if (maxModelToken && maxResponseTokens) {
                const maxNumTokens = maxModelToken - maxResponseTokens;
                nextNumTokensEstimate = await this._getTokenCount(nextMessages);
                const isValidPrompt = nextNumTokensEstimate + 200 <= maxNumTokens;
                if (!isValidPrompt) {
                    nextMessages = this._recursivePruning(nextMessages, maxNumTokens, systemMessage);
                }
            }
            parentMessageId = parentMessage.parentMessageId;
        } while (true);
        const maxTokens = Math.max(1, Math.min(maxModelToken - nextNumTokensEstimate, maxResponseTokens));
        console.log('本次携带上下文的长度', nextMessages.length, nextNumTokensEstimate);
        return { context: nextMessages, round: nextMessages.length, historyToken: nextNumTokensEstimate };
    }
    _getTokenCount(messages) {
        let text = messages.reduce((pre, cur) => {
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
        text = text.replace(/<\|endoftext\|>/g, '');
        return tokenizer.encode(text).length;
    }
    _recursivePruning(messages, maxNumTokens, systemMessage) {
        const currentTokens = this._getTokenCount(messages);
        if (currentTokens <= maxNumTokens) {
            return messages;
        }
        messages.splice(systemMessage ? 1 : 0, 1);
        return this._recursivePruning(messages, maxNumTokens, systemMessage);
    }
    getUuid() {
        return (0, uuid_1.v4)();
    }
}
exports.NineStore = NineStore;
