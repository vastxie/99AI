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
var StableDiffusionService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.StableDiffusionService = void 0;
const common_1 = require("@nestjs/common");
const axios_1 = require("axios");
const globalConfig_service_1 = require("../globalConfig/globalConfig.service");
const upload_service_1 = require("../upload/upload.service");
let StableDiffusionService = StableDiffusionService_1 = class StableDiffusionService {
    constructor(uploadService, globalConfigService) {
        this.uploadService = uploadService;
        this.globalConfigService = globalConfigService;
        this.logger = new common_1.Logger(StableDiffusionService_1.name);
    }
    async sdxl(inputs) {
        const { onSuccess, onFailure, apiKey, model, proxyUrl, modelName, timeout, chatId, prompt, } = inputs;
        let result = {
            answer: '',
            model: model,
            modelName: modelName,
            chatId: chatId,
            fileInfo: '',
            status: 2,
        };
        console.log('开始处理', { model, modelName, prompt });
        const options = {
            method: 'POST',
            url: `${proxyUrl}/v1/chat/completions`,
            timeout: timeout,
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${apiKey}`,
            },
            data: {
                model,
                messages: [{ role: 'user', content: prompt }],
            },
        };
        try {
            const response = await (0, axios_1.default)(options);
            console.log('API响应接收', response.data);
            if (response.data.choices && response.data.choices.length > 0) {
                const choice = response.data.choices[0];
                const content = choice.message.content;
                console.log('处理内容', content);
                const regex = /\]\((https?:\/\/[^\)]+)\)/;
                const match = content.match(regex);
                if (match && match[1]) {
                    result.fileInfo = match[1];
                    try {
                        const localStorageStatus = await this.globalConfigService.getConfigs(['localStorageStatus']);
                        if (Number(localStorageStatus)) {
                            const now = new Date();
                            const year = now.getFullYear();
                            const month = String(now.getMonth() + 1).padStart(2, '0');
                            const day = String(now.getDate()).padStart(2, '0');
                            const currentDate = `${year}${month}/${day}`;
                            result.fileInfo = await this.uploadService.uploadFileFromUrl({
                                url: result.fileInfo,
                                dir: `images/stable-diffusion/${currentDate}`,
                            });
                        }
                    }
                    catch (error) {
                        common_1.Logger.error(`上传文件失败: ${error.message}`, 'StableDiffusionService');
                    }
                    console.log('找到链接', match[1]);
                }
                else {
                    console.log('没有找到链接');
                }
                result.answer = `${prompt} 绘制成功`;
                if (result.fileInfo) {
                    onSuccess(result);
                    return;
                }
                else {
                    onFailure('No link found.');
                }
            }
            else {
                onFailure('No choices returned.');
            }
        }
        catch (error) {
            common_1.Logger.error('服务器错误，请求失败：', error);
        }
    }
};
StableDiffusionService = StableDiffusionService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [upload_service_1.UploadService,
        globalConfig_service_1.GlobalConfigService])
], StableDiffusionService);
exports.StableDiffusionService = StableDiffusionService;
