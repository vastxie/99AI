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
exports.SunoService = void 0;
const common_1 = require("@nestjs/common");
const axios_1 = require("axios");
const chatLog_service_1 = require("../chatLog/chatLog.service");
const globalConfig_service_1 = require("../globalConfig/globalConfig.service");
const upload_service_1 = require("../upload/upload.service");
let SunoService = class SunoService {
    constructor(chatLogService, uploadService, globalConfigService) {
        this.chatLogService = chatLogService;
        this.uploadService = uploadService;
        this.globalConfigService = globalConfigService;
    }
    async suno(inputs) {
        var _a, _b, _c;
        const { apiKey, proxyUrl, action, prompt, timeout, assistantLogId, taskData, extraParam, } = inputs;
        common_1.Logger.debug(`SunoService: ${JSON.stringify(inputs)}`, 'SunoService');
        let result = {
            text: '',
            fileInfo: '',
            taskId: '',
            taskData: '',
            status: 2,
        };
        common_1.Logger.log('开始生成音乐', 'SunoService');
        let response = null;
        let url = '';
        let payloadJson = {};
        const headers = { Authorization: `Bearer ${apiKey}` };
        if (action === 'LYRICS') {
            url = `${proxyUrl}/task/suno/v1/submit/lyrics`;
            payloadJson = { prompt: prompt };
        }
        if (action === 'MUSIC') {
            url = `${proxyUrl}/task/suno/v1/submit/music`;
            try {
                payloadJson = JSON.parse(taskData);
            }
            catch (error) {
                common_1.Logger.error(`解析taskData失败: ${error.message}`, 'SunoService');
                throw new Error('taskData格式错误');
            }
        }
        common_1.Logger.log(`正在准备发送请求到 ${url}，payload: ${JSON.stringify(payloadJson)}, headers: ${JSON.stringify(headers)}`, 'SunoService');
        try {
            response = await axios_1.default.post(url, payloadJson, { headers });
            common_1.Logger.debug(`任务提交结果，状态码: ${response.status}, 状态消息: ${response.statusText}, 数据: ${JSON.stringify(response.data)}`);
        }
        catch (error) {
            common_1.Logger.error(`任务提交失败: ${error.message}`, 'SunoService');
            throw new Error('任务提交失败');
        }
        if ((_a = response === null || response === void 0 ? void 0 : response.data) === null || _a === void 0 ? void 0 : _a.data) {
            result.taskId = (_b = response === null || response === void 0 ? void 0 : response.data) === null || _b === void 0 ? void 0 : _b.data;
            common_1.Logger.log(`任务提交成功, 任务ID: ${(_c = response === null || response === void 0 ? void 0 : response.data) === null || _c === void 0 ? void 0 : _c.data}`, 'SunoService');
        }
        else {
            throw new Error('未能获取结果数据, 即将重试');
        }
        try {
            await this.pollSunoMusicResult({
                proxyUrl,
                apiKey,
                taskId: response.data.data,
                timeout,
                prompt,
                action,
                onSuccess: async (data) => {
                    try {
                        await this.chatLogService.updateChatLog(assistantLogId, {
                            videoUrl: data === null || data === void 0 ? void 0 : data.videoUrl,
                            audioUrl: data === null || data === void 0 ? void 0 : data.audioUrl,
                            fileInfo: data === null || data === void 0 ? void 0 : data.fileInfo,
                            answer: (data === null || data === void 0 ? void 0 : data.answer) || prompt,
                            progress: '100%',
                            status: 3,
                            taskId: data === null || data === void 0 ? void 0 : data.taskId,
                            taskData: data === null || data === void 0 ? void 0 : data.taskData,
                        });
                        common_1.Logger.log('音乐任务已完成', 'SunoService');
                    }
                    catch (error) {
                        common_1.Logger.error(`更新日志失败: ${error.message}`, 'SunoService');
                    }
                },
                onAudioSuccess: async (data) => {
                    try {
                        await this.chatLogService.updateChatLog(assistantLogId, {
                            videoUrl: data === null || data === void 0 ? void 0 : data.videoUrl,
                            audioUrl: data === null || data === void 0 ? void 0 : data.audioUrl,
                            fileInfo: data === null || data === void 0 ? void 0 : data.fileInfo,
                            answer: (data === null || data === void 0 ? void 0 : data.answer) || prompt,
                            progress: data === null || data === void 0 ? void 0 : data.progress,
                            status: data.status,
                            taskId: data === null || data === void 0 ? void 0 : data.taskId,
                            taskData: data === null || data === void 0 ? void 0 : data.taskData,
                        });
                        common_1.Logger.log('音频生成成功，等待视频生成...', 'SunoService');
                    }
                    catch (error) {
                        common_1.Logger.error(`更新日志失败: ${error.message}`, 'SunoService');
                    }
                },
                onGenerating: async (data) => {
                    try {
                        await this.chatLogService.updateChatLog(assistantLogId, {
                            videoUrl: data === null || data === void 0 ? void 0 : data.videoUrl,
                            audioUrl: data === null || data === void 0 ? void 0 : data.audioUrl,
                            fileInfo: data === null || data === void 0 ? void 0 : data.fileInfo,
                            answer: (data === null || data === void 0 ? void 0 : data.answer) || '音乐生成中...',
                            progress: data === null || data === void 0 ? void 0 : data.progress,
                            status: data.status,
                        });
                        common_1.Logger.log('音乐生成中...', 'SunoService');
                    }
                    catch (error) {
                        common_1.Logger.error(`更新日志失败: ${error.message}`, 'SunoService');
                    }
                },
                onFailure: async (data) => {
                    try {
                        await this.chatLogService.updateChatLog(assistantLogId, {
                            answer: '音乐生成失败',
                            status: data.status,
                        });
                        common_1.Logger.log('生成失败', 'SunoService');
                    }
                    catch (error) {
                        common_1.Logger.error(`更新日志失败: ${error.message}`, 'SunoService');
                    }
                },
            });
        }
        catch (error) {
            common_1.Logger.error('查询生成结果时发生错误:', error.message, 'SunoService');
            throw new Error('查询生成结果时发生错误');
        }
        return result;
    }
    async pollSunoMusicResult(inputs) {
        const { proxyUrl, apiKey, taskId, timeout, onSuccess, onAudioSuccess, onFailure, onGenerating, action, } = inputs;
        let result = {
            videoUrl: '',
            audioUrl: '',
            fileInfo: '',
            drawId: '',
            taskData: '',
            status: 2,
            progress: 0,
            answer: '',
        };
        const headers = { Authorization: `Bearer ${apiKey}` };
        const url = `${proxyUrl}/task/suno/v1/fetch/${taskId}`;
        const startTime = Date.now();
        const POLL_INTERVAL = 5000;
        let retryCount = 0;
        try {
            while (Date.now() - startTime < timeout) {
                await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL));
                try {
                    const res = await axios_1.default.get(url, { headers });
                    const responses = res.data.data;
                    common_1.Logger.debug(`轮询结果: ${JSON.stringify(responses)}`, 'SunoService');
                    if (action === 'LYRICS') {
                        if (responses.status === 'SUCCESS') {
                            result.taskId = responses.data.id;
                            result.taskData = JSON.stringify(responses.data);
                            result.answer = responses.data.text;
                            onSuccess(result);
                            return;
                        }
                        result.progress = responses === null || responses === void 0 ? void 0 : responses.progress;
                        result.answer = `歌词生成中`;
                        if (result.progress) {
                            onGenerating(result);
                        }
                    }
                    if (action === 'MUSIC') {
                        if (responses.data) {
                            const data = responses.data;
                            result.taskData = JSON.stringify(data);
                            if (Array.isArray(data)) {
                                const validAudioUrls = data
                                    .map((item) => item.audio_url)
                                    .filter((url) => url);
                                const validVideoUrls = data
                                    .map((item) => item.video_url)
                                    .filter((url) => url);
                                const validImageUrls = data
                                    .map((item) => item.image_url)
                                    .filter((url) => url);
                                const titles = data.map((item) => item.title);
                                const firstTitle = titles.length > 0 ? titles[0] : '音乐已生成';
                                if (responses.status === 'SUCCESS') {
                                    let audioUrls = [];
                                    let videoUrls = [];
                                    let imageUrls = [];
                                    try {
                                        const localStorageStatus = await this.globalConfigService.getConfigs([
                                            'localStorageStatus',
                                        ]);
                                        if (Number(localStorageStatus)) {
                                            const now = new Date();
                                            const year = now.getFullYear();
                                            const month = String(now.getMonth() + 1).padStart(2, '0');
                                            const day = String(now.getDate()).padStart(2, '0');
                                            const currentDate = `${year}${month}/${day}`;
                                            for (const url of validAudioUrls) {
                                                try {
                                                    const uploadedUrl = await this.uploadService.uploadFileFromUrl({
                                                        url: url,
                                                        dir: `audio/suno-music/${currentDate}`,
                                                    });
                                                    audioUrls.push(uploadedUrl);
                                                }
                                                catch (error) {
                                                    common_1.Logger.error(`上传音频文件失败: ${error.message}`, 'SunoService');
                                                    audioUrls.push(url);
                                                }
                                            }
                                            for (const url of validVideoUrls) {
                                                try {
                                                    const uploadedUrl = await this.uploadService.uploadFileFromUrl({
                                                        url: url,
                                                        dir: `video/suno-music/${currentDate}`,
                                                    });
                                                    videoUrls.push(uploadedUrl);
                                                }
                                                catch (error) {
                                                    common_1.Logger.error(`上传视频文件失败: ${error.message}`, 'SunoService');
                                                    videoUrls.push(url);
                                                }
                                            }
                                            for (const url of validImageUrls) {
                                                try {
                                                    const uploadedUrl = await this.uploadService.uploadFileFromUrl({
                                                        url: url,
                                                        dir: `images/suno-music/${currentDate}`,
                                                    });
                                                    imageUrls.push(uploadedUrl);
                                                }
                                                catch (error) {
                                                    common_1.Logger.error(`上传图片文件失败: ${error.message}`, 'SunoService');
                                                    imageUrls.push(url);
                                                }
                                            }
                                        }
                                        else {
                                            audioUrls = validAudioUrls;
                                            videoUrls = validVideoUrls;
                                            imageUrls = validImageUrls;
                                        }
                                    }
                                    catch (error) {
                                        common_1.Logger.error(`获取配置失败: ${error.message}`, 'LumaService');
                                        audioUrls = validAudioUrls;
                                        videoUrls = validVideoUrls;
                                        imageUrls = validImageUrls;
                                    }
                                    result.audioUrl = audioUrls.join(',');
                                    result.videoUrl = videoUrls.join(',');
                                    result.fileInfo = imageUrls.join(',');
                                    if (validAudioUrls.length === 2) {
                                        result.status = 3;
                                        result.answer = firstTitle;
                                    }
                                    else {
                                        result.status = 2;
                                        result.progress = responses === null || responses === void 0 ? void 0 : responses.progress;
                                        result.answer = `当前生成进度 ${responses === null || responses === void 0 ? void 0 : responses.progress}`;
                                    }
                                    common_1.Logger.debug(`音乐生成成功: ${JSON.stringify(data)}`, 'SunoService');
                                    onSuccess(result);
                                    return;
                                }
                                else {
                                    result.audioUrl = validAudioUrls.join(',');
                                    result.videoUrl = validVideoUrls.join(',');
                                    result.fileInfo = validImageUrls.join(',');
                                    result.status = 2;
                                    result.progress = responses === null || responses === void 0 ? void 0 : responses.progress;
                                    result.answer = firstTitle;
                                    onAudioSuccess(result);
                                }
                            }
                        }
                        if (!result.audioUrl && result.progress && result.status === 2) {
                            onGenerating(result);
                        }
                    }
                }
                catch (error) {
                    retryCount++;
                    common_1.Logger.error(`轮询失败，重试次数: ${retryCount}`, 'SunoService');
                }
            }
            common_1.Logger.error('轮询超时，请稍后再试！', 'SunoService');
            result.status = 4;
            onFailure(result);
            throw new Error('查询超时，请稍后再试！');
        }
        catch (error) {
            common_1.Logger.error(`轮询过程中发生错误: ${error}`, 'SunoService');
            result.status = 5;
            onFailure(result);
        }
    }
};
SunoService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [chatLog_service_1.ChatLogService,
        upload_service_1.UploadService,
        globalConfig_service_1.GlobalConfigService])
], SunoService);
exports.SunoService = SunoService;
