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
Object.defineProperty(exports, "__esModule", { value: true });
exports.MidjourneyService = void 0;
const common_1 = require("@nestjs/common");
const axios_1 = require("axios");
const chatLog_service_1 = require("../chatLog/chatLog.service");
const globalConfig_service_1 = require("../globalConfig/globalConfig.service");
const upload_service_1 = require("../upload/upload.service");
let MidjourneyService = class MidjourneyService {
    constructor(uploadService, globalConfigService, chatLogService) {
        this.uploadService = uploadService;
        this.globalConfigService = globalConfigService;
        this.chatLogService = chatLogService;
    }
    async midjourneyDraw(inputs) {
        var _a, _b;
        const { id, apiKey, proxyUrl, action, drawId, prompt, usePrompt, customId, timeout, assistantLogId, } = inputs;
        let result = {
            text: '',
            fileInfo: '',
            drawId: '',
            customId: '',
            status: 2,
        };
        let response;
        let retryCount = 0;
        let url = '';
        while (retryCount < 3) {
            let payloadJson = {};
            try {
                if (action === 'IMAGINE') {
                    url = `${proxyUrl}/mj/submit/imagine`;
                    payloadJson = { prompt: usePrompt };
                }
                else {
                    url = `${proxyUrl}/mj/submit/action`;
                    payloadJson = { taskId: drawId, customId: customId };
                }
                const headers = { 'mj-api-secret': apiKey };
                common_1.Logger.log(`正在准备发送请求到 ${url}，payload: ${JSON.stringify(payloadJson)}, headers: ${JSON.stringify(headers)}`, 'MidjourneyService');
                response = await axios_1.default.post(url, payloadJson, { headers });
                if ((_a = response === null || response === void 0 ? void 0 : response.data) === null || _a === void 0 ? void 0 : _a.result) {
                    result.drawId = (_b = response === null || response === void 0 ? void 0 : response.data) === null || _b === void 0 ? void 0 : _b.result;
                    break;
                }
                else {
                    throw new Error('未能获取结果数据, 即将重试');
                }
            }
            catch (error) {
                retryCount++;
                if (retryCount >= 3) {
                    common_1.Logger.log(`绘画任务提交失败, 请检查后台配置或者稍后重试! ${error}`, 'MidjourneyService');
                }
            }
        }
        this.pollMjDrawingResult({
            proxyUrl,
            apiKey,
            drawId: response.data.result,
            timeout,
            prompt,
            onSuccess: async (data) => {
                await this.chatLogService.updateChatLog(assistantLogId, {
                    fileInfo: data === null || data === void 0 ? void 0 : data.fileInfo,
                    answer: (data === null || data === void 0 ? void 0 : data.answer) || prompt,
                    progress: '100%',
                    status: 3,
                    drawId: data === null || data === void 0 ? void 0 : data.drawId,
                    customId: data === null || data === void 0 ? void 0 : data.customId,
                });
                common_1.Logger.log('绘图成功！');
            },
            onDrawing: async (data) => {
                await this.chatLogService.updateChatLog(assistantLogId, {
                    answer: (data === null || data === void 0 ? void 0 : data.answer) || '绘制中',
                    progress: data === null || data === void 0 ? void 0 : data.progress,
                    status: 2,
                });
                common_1.Logger.log(`绘制中！绘制进度${data === null || data === void 0 ? void 0 : data.progress}`);
            },
            onFailure: async (data) => {
                await this.chatLogService.updateChatLog(assistantLogId, {
                    answer: '绘图失败',
                    status: data.status,
                });
                common_1.Logger.log('绘图失败');
            },
        }).catch((error) => {
            common_1.Logger.error('查询绘图结果时发生错误:', error, 'MidjourneyService');
        });
        common_1.Logger.log(`绘画任务提交成功, 绘画ID: ${response.data.result}`, 'MidjourneyService');
        return result;
    }
    async pollMjDrawingResult(inputs) {
        const { proxyUrl, apiKey, drawId, timeout, onSuccess, prompt, onFailure, onDrawing, } = inputs;
        const { mjNotSaveImg, mjProxyImgUrl, mjNotUseProxy } = await this.globalConfigService.getConfigs([
            'mjNotSaveImg',
            'mjProxyImgUrl',
            'mjNotUseProxy',
        ]);
        let response;
        let result = {
            fileInfo: '',
            drawId: '',
            customId: '',
            status: 2,
            progress: 0,
            answer: '',
        };
        let payloadJson = {};
        const startTime = Date.now();
        const POLL_INTERVAL = 5000;
        let retryCount = 0;
        let pollingCount = 0;
        try {
            while (Date.now() - startTime < timeout) {
                await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL));
                try {
                    const headers = {
                        'Content-Type': 'application/x-www-form-urlencoded',
                        'mj-api-secret': apiKey,
                    };
                    const url = `${proxyUrl}/mj/task/${drawId}/fetch`;
                    const res = await axios_1.default.get(url, { headers });
                    const responses = res.data;
                    if (responses.status === 'SUCCESS') {
                        common_1.Logger.log(`绘制成功, 获取到的URL: ${responses.imageUrl}`, 'MidjourneyService');
                        let processedUrl = responses.imageUrl;
                        const shouldReplaceUrl = mjNotUseProxy === '0' && mjProxyImgUrl;
                        let logMessage = '';
                        if (shouldReplaceUrl) {
                            const newUrlBase = new URL(mjProxyImgUrl);
                            const parsedUrl = new URL(responses.imageUrl);
                            parsedUrl.protocol = newUrlBase.protocol;
                            parsedUrl.hostname = newUrlBase.hostname;
                            parsedUrl.port = newUrlBase.port ? newUrlBase.port : '';
                            processedUrl = parsedUrl.toString();
                            logMessage = `使用代理替换后的 URL: ${processedUrl}`;
                            common_1.Logger.log(logMessage, 'MidjourneyService');
                        }
                        if (mjNotSaveImg !== '1') {
                            try {
                                common_1.Logger.log(`------> 开始上传图片！！！`);
                                const now = new Date();
                                const year = now.getFullYear();
                                const month = String(now.getMonth() + 1).padStart(2, '0');
                                const day = String(now.getDate()).padStart(2, '0');
                                const currentDate = `${year}${month}/${day}`;
                                processedUrl = await this.uploadService.uploadFileFromUrl({
                                    url: processedUrl,
                                    dir: `images/midjourney/${currentDate}`,
                                });
                                logMessage = `上传成功 URL: ${processedUrl}`;
                            }
                            catch (uploadError) {
                                common_1.Logger.error('存储图片失败，使用原始/代理图片链接');
                                logMessage = `存储图片失败，使用原始/代理图片链接 ${processedUrl}`;
                            }
                            common_1.Logger.log(logMessage, 'MidjourneyService');
                        }
                        else {
                            logMessage = `不保存图片，使用 URL: ${processedUrl}`;
                            common_1.Logger.log(logMessage, 'MidjourneyService');
                        }
                        result.fileInfo = processedUrl;
                        result.drawId = responses.id;
                        result.customId = JSON.stringify(responses.buttons);
                        result.answer = `${prompt}\n${responses.finalPrompt || responses.properties.finalPrompt || ''}`;
                        onSuccess(result);
                        return;
                    }
                    result.progress = responses === null || responses === void 0 ? void 0 : responses.progress;
                    result.answer = `当前绘制进度 ${responses === null || responses === void 0 ? void 0 : responses.progress}`;
                    if (result.progress) {
                        onDrawing(result);
                    }
                }
                catch (error) {
                    retryCount++;
                    common_1.Logger.error(`轮询过程中发生错误: ${error}`, 'MidjourneyService');
                }
            }
            common_1.Logger.error(`超过 ${startTime / 1000} s 未完成绘画, 请稍后再试! MidjourneyService`);
            result.status = 4;
            onFailure(result);
            throw new common_1.HttpException('绘画超时，请稍后再试！', common_1.HttpStatus.BAD_REQUEST);
        }
        catch (error) {
            common_1.Logger.error(`绘画失败: ${error} MidjourneyService`);
            result.status = 5;
            onFailure(result);
        }
    }
};
MidjourneyService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [upload_service_1.UploadService,
        globalConfig_service_1.GlobalConfigService,
        chatLog_service_1.ChatLogService])
], MidjourneyService);
exports.MidjourneyService = MidjourneyService;
