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
        var _a, _b, _c, _d;
        const { id, apiKey, proxyUrl, action, drawId, prompt, usePrompt, customId, timeout, fileInfo, assistantLogId, } = inputs;
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
        const headers = { 'mj-api-secret': apiKey };
        common_1.Logger.debug(`当前任务类型: ${action}`, 'MidjourneyService');
        while (retryCount < 3) {
            let payloadJson = {};
            try {
                if (action === 'IMAGINE') {
                    url = `${proxyUrl}/mj/submit/imagine`;
                    payloadJson = { prompt: usePrompt };
                }
                else if (action === 'DESCRIBE') {
                    url = `${proxyUrl}/mj/submit/describe`;
                    if (fileInfo) {
                        const response = await fetch(fileInfo);
                        const blob = await response.blob();
                        const buffer = Buffer.from(await blob.arrayBuffer());
                        const base64String = buffer.toString('base64');
                        payloadJson = { base64: `data:image/png;base64,${base64String}` };
                    }
                    else {
                        return;
                    }
                }
                else if (action === 'PICREADER') {
                    url = `${proxyUrl}/mj/submit/action`;
                    payloadJson = { taskId: drawId, customId: customId };
                    response = await axios_1.default.post(url, payloadJson, { headers });
                    if ((response === null || response === void 0 ? void 0 : response.status) === 200 && ((_a = response === null || response === void 0 ? void 0 : response.data) === null || _a === void 0 ? void 0 : _a.result)) {
                        url = `${proxyUrl}/mj/submit/modal`;
                        payloadJson = { taskId: (_b = response === null || response === void 0 ? void 0 : response.data) === null || _b === void 0 ? void 0 : _b.result };
                    }
                }
                else {
                    url = `${proxyUrl}/mj/submit/action`;
                    payloadJson = { taskId: drawId, customId: customId };
                }
                common_1.Logger.log(`正在准备发送请求到 ${url}，payload: ${JSON.stringify(payloadJson)}, headers: ${JSON.stringify(headers)}`, 'MidjourneyService');
                response = await axios_1.default.post(url, payloadJson, { headers });
                if ((response === null || response === void 0 ? void 0 : response.status) === 200 && ((_c = response === null || response === void 0 ? void 0 : response.data) === null || _c === void 0 ? void 0 : _c.result)) {
                    common_1.Logger.debug(`收到响应: ${JSON.stringify(response.data)}`, 'MidjourneyService');
                    result.drawId = (_d = response === null || response === void 0 ? void 0 : response.data) === null || _d === void 0 ? void 0 : _d.result;
                    result.state = 2;
                    result.answer = '绘画任务提交成功';
                    common_1.Logger.log(`绘画任务提交成功, 绘画ID: ${response.data.result}`, 'MidjourneyService');
                    break;
                }
                else {
                    throw new Error('未能获取结果数据, 即将重试');
                }
            }
            catch (error) {
                retryCount++;
                if (retryCount >= 3) {
                    result.answer = '任务提交失败，请检查提示词后重试';
                    result.status = 5;
                    common_1.Logger.log(`绘画任务提交失败, 请检查后台配置或者稍后重试! ${error}`, 'MidjourneyService');
                }
            }
        }
        this.pollMjDrawingResult({
            proxyUrl,
            apiKey,
            drawId: result.drawId,
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
                common_1.Logger.log('绘图成功！', 'MidjourneyService');
            },
            onDrawing: async (data) => {
                await this.chatLogService.updateChatLog(assistantLogId, {
                    answer: (data === null || data === void 0 ? void 0 : data.answer) || '绘制中',
                    progress: data === null || data === void 0 ? void 0 : data.progress,
                    status: 2,
                });
                common_1.Logger.log(`绘制中！绘制进度${data === null || data === void 0 ? void 0 : data.progress}`, 'MidjourneyService');
            },
            onFailure: async (data) => {
                await this.chatLogService.updateChatLog(assistantLogId, {
                    answer: '绘图失败',
                    status: data.status,
                });
                common_1.Logger.log('绘图失败', 'MidjourneyService');
            },
        }).catch((error) => {
            common_1.Logger.error('查询绘图结果时发生错误:', error, 'MidjourneyService');
        });
        return result;
    }
    async pollMjDrawingResult(inputs) {
        const { proxyUrl, apiKey, drawId, timeout, onSuccess, prompt, onFailure, onDrawing, } = inputs;
        const { mjNotSaveImg, mjProxyImgUrl, mjNotUseProxy } = await this.globalConfigService.getConfigs([
            'mjNotSaveImg',
            'mjProxyImgUrl',
            'mjNotUseProxy',
        ]);
        let result = {
            fileInfo: '',
            drawId: '',
            customId: '',
            status: 2,
            progress: 0,
            answer: '',
        };
        const startTime = Date.now();
        const POLL_INTERVAL = 5000;
        let retryCount = 0;
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
                    common_1.Logger.debug(`查询结果: ${JSON.stringify(responses)}`, 'MidjourneyService');
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
                                common_1.Logger.log(`------> 开始上传图片！！！`, 'MidjourneyService');
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
