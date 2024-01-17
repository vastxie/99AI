"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.NineStore = void 0;
const uuid_1 = require("uuid");
const tiktoken_1 = require("@dqbd/tiktoken");
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
        let { maxRounds, maxModelToken, maxResponseTokens, systemMessage = '', name } = options;
        let { parentMessageId } = options;
        let messages = [];
        let nextNumTokensEstimate = 0;
        if (systemMessage) {
            messages.push({ role: 'system', content: systemMessage });
        }
        const systemMessageOffset = messages.length;
        let round = 0;
        let nextMessages = text ? messages.concat([{ role: 'user', content: text, name }]) : messages;
        do {
            if (!parentMessageId) {
                break;
            }
            const parentMessage = await this.getData(parentMessageId);
            if (!parentMessage) {
                break;
            }
            const { text, name, role } = parentMessage;
            nextMessages = nextMessages.slice(0, systemMessageOffset).concat([
                { role, content: text, name },
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
            return pre += cur.content;
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
