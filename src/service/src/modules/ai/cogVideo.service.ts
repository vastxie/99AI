import { Injectable, Logger } from '@nestjs/common';
import axios, { AxiosResponse } from 'axios';
import { ChatLogService } from '../chatLog/chatLog.service';
import { GlobalConfigService } from '../globalConfig/globalConfig.service';
import { UploadService } from '../upload/upload.service';
// 引入其他需要的模块或服务

@Injectable()
export class CogVideoService {
  constructor(
    private readonly chatLogService: ChatLogService,
    private readonly globalConfigService: GlobalConfigService,
    private readonly uploadService: UploadService
  ) {}

  async cogVideo(inputs) {
    const { apiKey, proxyUrl, fileInfo, prompt, timeout, assistantLogId } =
      inputs;
    let result: any = {
      text: '',
      fileInfo: '',
      taskId: '',
      taskData: '',
      status: 2,
    };

    let response: AxiosResponse<any, any> | null = null;
    let url = '';
    let payloadJson = {};
    const headers = { Authorization: `Bearer ${apiKey}` };

    url = `${proxyUrl}/cogvideox/v4/videos/generations`;
    payloadJson = {
      model: 'cogvideox',
      prompt: prompt,
    };

    // 如果 fileInfo 存在，则添加 image_url 属性
    if (fileInfo) {
      payloadJson['image_url'] = fileInfo;
    }

    Logger.log(
      `正在准备发送请求到 ${url}，payload: ${JSON.stringify(
        payloadJson
      )}, headers: ${JSON.stringify(headers)}`,
      'CogService'
    );

    try {
      response = await axios.post(url, payloadJson, { headers });
      Logger.debug(
        `任务提交结果，状态码: ${response.status}, 状态消息: ${
          response.statusText
        }, 数据: ${JSON.stringify(response.data)}`
      );
    } catch (error) {
      Logger.error(`任务提交失败: ${error.message}`, 'CogService');
      throw new Error('任务提交失败');
    }

    if (response?.data?.id) {
      result.taskId = response?.data?.id;
      Logger.log(`任务提交成功, 任务ID: ${response?.data?.id}`, 'CogService');
    } else {
      throw new Error('未能获取结果数据, 即将重试');
    }

    try {
      await this.pollCogVideoResult({
        proxyUrl,
        apiKey,
        taskId: response.data.id,
        timeout,
        prompt,
        onSuccess: async (data) => {
          try {
            await this.chatLogService.updateChatLog(assistantLogId, {
              videoUrl: data?.videoUrl,
              audioUrl: data?.audioUrl,
              fileInfo: data?.fileInfo,
              answer: data?.answer || prompt,
              progress: '100%',
              status: 3,
              taskId: data?.taskId,
              taskData: data?.taskData,
            });
            Logger.log('视频任务已完成', 'CogService');
          } catch (error) {
            Logger.error(`更新日志失败: ${error.message}`, 'CogService');
          }
        },
        onGenerating: async (data) => {
          try {
            await this.chatLogService.updateChatLog(assistantLogId, {
              videoUrl: data?.videoUrl,
              audioUrl: data?.audioUrl,
              fileInfo: data?.fileInfo,
              answer: data?.answer || '视频生成中...',
              progress: data?.progress,
              status: data.status,
            });
            Logger.log('视频生成中...', 'CogService');
          } catch (error) {
            Logger.error(`更新日志失败: ${error.message}`, 'CogService');
          }
        },
        onFailure: async (data) => {
          try {
            await this.chatLogService.updateChatLog(assistantLogId, {
              answer: '视频生成失败',
              status: data.status,
            });
            Logger.log('生成失败', 'Lum aService');
          } catch (error) {
            Logger.error(`更新日志失败: ${error.message}`, 'CogService');
          }
        },
      });
    } catch (error) {
      Logger.error('查询生成结果时发生错误:', error.message, 'CogService');
      throw new Error('查询生成结果时发生错误');
    }
    return result;
  }

  async pollCogVideoResult(inputs) {
    const {
      proxyUrl,
      apiKey,
      taskId,
      timeout,
      onSuccess,
      onFailure,
      onGenerating,
      prompt,
      action,
    } = inputs;

    let result: any = {
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
    const url = `${proxyUrl}/cogvideox/v4/async-result/${taskId}`;
    const startTime = Date.now();
    const totalDuration = 300000;
    const POLL_INTERVAL = 5000; // 每5秒查一次
    let retryCount = 0; // 当前重试次数

    try {
      while (Date.now() - startTime < timeout) {
        await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL));

        try {
          // Logger.debug(url, 'CogService');
          const res = await axios.get(url, { headers });

          const interval = setInterval(() => {
            const elapsed = Date.now() - startTime;
            let percentage = Math.floor((elapsed / totalDuration) * 100);
            if (percentage >= 99) percentage = 99; // 最多显示99%
            result.answer = `视频生成中 （${percentage}%）`;
            // onGenerate(result);
          }, 1000); // 每秒更新一次进度

          const responses = res.data;

          Logger.debug(`轮询结果: ${JSON.stringify(responses)}`, 'CogService');

          if (responses.task_status === 'SUCCESS') {
            result.taskId = responses.request_id;
            result.taskData = JSON.stringify(responses);
            Logger.log('视频生成成功', 'CogService');
            result.fileInfo = responses.video_result[0].url;
            Logger.log(result.fileInfo, 'CogService');
            try {
              const localStorageStatus =
                await this.globalConfigService.getConfigs([
                  'localStorageStatus',
                ]);
              if (Number(localStorageStatus)) {
                // 使用 Date 对象获取当前日期并格式化为 YYYYMM/DD
                const now = new Date();
                const year = now.getFullYear();
                const month = String(now.getMonth() + 1).padStart(2, '0'); // 月份从0开始，所以+1
                const day = String(now.getDate()).padStart(2, '0');
                const currentDate = `${year}${month}/${day}`;
                result.fileInfo = await this.uploadService.uploadFileFromUrl({
                  url: responses.video_result[0].url,
                  dir: `video/cog/${currentDate}`,
                });
              }
            } catch (error) {
              Logger.error(`上传文件失败: ${error.message}`, 'CogService');
            }

            result.answer = `提示词: "${prompt}"`;
            onSuccess(result);
            clearInterval(interval);
            return;
          } else {
            onGenerating(result);
          }

          if (result.progress) {
          }
        } catch (error) {
          retryCount++;
          Logger.error(`轮询失败，重试次数: ${retryCount}`, 'CogService');
        }
      }
      Logger.error('轮询超时，请稍后再试！', 'CogService');
      result.status = 4;
      onFailure(result);
      throw new Error('查询超时，请稍后再试！');
    } catch (error) {
      Logger.error(`轮询过程中发生错误: ${error}`, 'CogService');
      result.status = 5;
      onFailure(result);
    }
  }
}
