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
var OpenAIDrawService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.OpenAIDrawService = void 0;
const common_1 = require("@nestjs/common");
const axios_1 = require("axios");
const chatLog_service_1 = require("../chatLog/chatLog.service");
const globalConfig_service_1 = require("../globalConfig/globalConfig.service");
const upload_service_1 = require("../upload/upload.service");
const openaiChat_service_1 = require("./openaiChat.service");
let OpenAIDrawService = OpenAIDrawService_1 = class OpenAIDrawService {
    constructor(uploadService, globalConfigService, chatLogService, openAIChatService) {
        this.uploadService = uploadService;
        this.globalConfigService = globalConfigService;
        this.chatLogService = chatLogService;
        this.openAIChatService = openAIChatService;
        this.logger = new common_1.Logger(OpenAIDrawService_1.name);
    }
    async dalleDraw(inputs, buildMessageFromParentMessageId) {
        var _a, _b, _c, _d;
        common_1.Logger.log('开始提交 Dalle 绘图任务 ', 'DrawService');
        const { apiKey, model, proxyUrl, prompt, extraParam, timeout, onSuccess, onFailure, groupId, } = inputs;
        const isDalleChat = await this.globalConfigService.getConfigs([
            'isDalleChat',
        ]);
        let drawPrompt;
        if (isDalleChat === '1') {
            try {
                common_1.Logger.log('已开启连续绘画模式', 'DalleDraw');
                const { messagesHistory } = await buildMessageFromParentMessageId(`参考上文，结合我的需求，给出绘画描述。我的需求是：${prompt}`, {
                    groupId,
                    systemMessage: '你是一个绘画提示词生成工具，请根据用户的要求，结合上下文，用一段文字，描述用户需要的绘画需求，不用包含任何礼貌性的寒暄,只需要场景的描述,可以适当联想',
                    maxModelTokens: 8000,
                    maxRounds: 5,
                    fileInfo: '',
                }, this.chatLogService);
                drawPrompt = await this.openAIChatService.chatFree(prompt, undefined, messagesHistory);
            }
            catch (error) {
                console.error('调用chatFree失败：', error);
                drawPrompt = prompt;
            }
        }
        else {
            drawPrompt = prompt;
        }
        const size = (extraParam === null || extraParam === void 0 ? void 0 : extraParam.size) || '1024x1024';
        let result = { answer: '', fileInfo: '', status: 2 };
        try {
            const options = {
                method: 'POST',
                url: `${proxyUrl}/v1/images/generations`,
                timeout: timeout,
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${apiKey}`,
                },
                data: {
                    model: model,
                    prompt: drawPrompt,
                    size,
                },
            };
            const response = await (0, axios_1.default)(options);
            const url = response.data.data[0].url;
            try {
                common_1.Logger.log(`------> 开始上传图片！！！`, 'DrawService');
                const now = new Date();
                const year = now.getFullYear();
                const month = String(now.getMonth() + 1).padStart(2, '0');
                const day = String(now.getDate()).padStart(2, '0');
                const currentDate = `${year}${month}/${day}`;
                result.fileInfo = await this.uploadService.uploadFileFromUrl({
                    url: url,
                    dir: `images/dalle/${currentDate}`,
                });
                common_1.Logger.log(`图片上传成功，URL: ${result.fileInfo}`, 'DrawService');
            }
            catch (error) {
                common_1.Logger.error(`上传图片过程中出现错误: ${error}`, 'DrawService');
            }
            let revised_prompt_cn;
            try {
                revised_prompt_cn = await this.openAIChatService.chatFree(`根据提示词{${response.data.data[0].revised_prompt}}, 模拟AI绘画机器人的语气，用中文回复，告诉用户已经画好了`);
            }
            catch (error) {
                revised_prompt_cn = `${prompt} 绘制成功`;
                common_1.Logger.error('翻译失败: ', error);
            }
            result.answer = revised_prompt_cn;
            result.status = 3;
            onSuccess(result);
            return;
        }
        catch (error) {
            result.status = 5;
            onFailure(result);
            const status = ((_a = error === null || error === void 0 ? void 0 : error.response) === null || _a === void 0 ? void 0 : _a.status) || 500;
            console.log('draw error: ', JSON.stringify(error), status);
            const message = (_d = (_c = (_b = error === null || error === void 0 ? void 0 : error.response) === null || _b === void 0 ? void 0 : _b.data) === null || _c === void 0 ? void 0 : _c.error) === null || _d === void 0 ? void 0 : _d.message;
            if (status === 429) {
                result.text = '当前请求已过载、请稍等会儿再试试吧！';
                return result;
            }
            if (status === 400 &&
                message.includes('This request has been blocked by our content filters')) {
                result.text = '您的请求已被系统拒绝。您的提示可能存在一些非法的文本。';
                return result;
            }
            if (status === 400 &&
                message.includes('Billing hard limit has been reached')) {
                result.text =
                    '当前模型key已被封禁、已冻结当前调用Key、尝试重新对话试试吧！';
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
};
OpenAIDrawService = OpenAIDrawService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [upload_service_1.UploadService,
        globalConfig_service_1.GlobalConfigService,
        chatLog_service_1.ChatLogService,
        openaiChat_service_1.OpenAIChatService])
], OpenAIDrawService);
exports.OpenAIDrawService = OpenAIDrawService;
