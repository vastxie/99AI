import { Injectable, Logger } from '@nestjs/common';
import axios, { AxiosResponse } from 'axios';
import { ChatLogService } from '../chatLog/chatLog.service';
import { GlobalConfigService } from '../globalConfig/globalConfig.service';
import { UploadService } from '../upload/upload.service';
// 引入其他需要的模块或服务

@Injectable()
export class SunoService {
  constructor(
    private readonly chatLogService: ChatLogService,
    private readonly uploadService: UploadService,
    private readonly globalConfigService: GlobalConfigService
  ) {}
  async suno(inputs) {
    const {
      apiKey,
      proxyUrl,
      action,
      prompt,
      timeout,
      assistantLogId,
      taskData,
      extraParam,
    } = inputs;
    Logger.debug(`SunoService: ${JSON.stringify(inputs)}`, 'SunoService');
    // return;
    let result: any = {
      text: '',
      fileInfo: '',
      taskId: '',
      taskData: '',
      status: 2,
    };
    Logger.log('开始生成音乐', 'SunoService');

    /* 提交绘画任务 */
    let response: AxiosResponse<any, any> | null = null;
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
      } catch (error) {
        Logger.error(`解析taskData失败: ${error.message}`, 'SunoService');
        throw new Error('taskData格式错误');
      }
    }

    Logger.log(
      `正在准备发送请求到 ${url}，payload: ${JSON.stringify(
        payloadJson
      )}, headers: ${JSON.stringify(headers)}`,
      'SunoService'
    );

    try {
      response = await axios.post(url, payloadJson, { headers });
      Logger.debug(
        `任务提交结果，状态码: ${response.status}, 状态消息: ${
          response.statusText
        }, 数据: ${JSON.stringify(response.data)}`
      );
    } catch (error) {
      Logger.error(`任务提交失败: ${error.message}`, 'SunoService');
      throw new Error('任务提交失败');
    }

    if (response?.data?.data) {
      result.taskId = response?.data?.data;
      Logger.log(
        `任务提交成功, 任务ID: ${response?.data?.data}`,
        'SunoService'
      );
    } else {
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
              videoUrl: data?.videoUrl,
              audioUrl: data?.audioUrl,
              fileInfo: data?.fileInfo,
              answer: data?.answer || prompt,
              progress: '100%',
              status: 3,
              taskId: data?.taskId,
              taskData: data?.taskData,
            });
            Logger.log('音乐任务已完成', 'SunoService');
          } catch (error) {
            Logger.error(`更新日志失败: ${error.message}`, 'SunoService');
          }
        },
        onAudioSuccess: async (data) => {
          try {
            await this.chatLogService.updateChatLog(assistantLogId, {
              videoUrl: data?.videoUrl,
              audioUrl: data?.audioUrl,
              fileInfo: data?.fileInfo,
              answer: data?.answer || prompt,
              progress: data?.progress,
              status: data.status,
              taskId: data?.taskId,
              taskData: data?.taskData,
            });
            Logger.log('音频生成成功，等待视频生成...', 'SunoService');
          } catch (error) {
            Logger.error(`更新日志失败: ${error.message}`, 'SunoService');
          }
        },
        onGenerating: async (data) => {
          try {
            await this.chatLogService.updateChatLog(assistantLogId, {
              videoUrl: data?.videoUrl,
              audioUrl: data?.audioUrl,
              fileInfo: data?.fileInfo,
              answer: data?.answer || '音乐生成中...',
              progress: data?.progress,
              status: data.status,
            });
            Logger.log('音乐生成中...', 'SunoService');
          } catch (error) {
            Logger.error(`更新日志失败: ${error.message}`, 'SunoService');
          }
        },
        onFailure: async (data) => {
          try {
            await this.chatLogService.updateChatLog(assistantLogId, {
              answer: '音乐生成失败',
              status: data.status,
            });
            Logger.log('生成失败', 'SunoService');
          } catch (error) {
            Logger.error(`更新日志失败: ${error.message}`, 'SunoService');
          }
        },
      });
    } catch (error) {
      Logger.error('查询生成结果时发生错误:', error.message, 'SunoService');
      throw new Error('查询生成结果时发生错误');
    }
    return result;
  }

  async pollSunoMusicResult(inputs) {
    const {
      proxyUrl,
      apiKey,
      taskId,
      timeout,
      onSuccess,
      onAudioSuccess,
      onFailure,
      onGenerating,
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
    const url = `${proxyUrl}/task/suno/v1/fetch/${taskId}`;
    const startTime = Date.now();
    const POLL_INTERVAL = 5000; // 每5秒查一次
    let retryCount = 0; // 当前重试次数
    try {
      while (Date.now() - startTime < timeout) {
        await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL));

        try {
          // Logger.debug(url, 'SunoService');
          const res = await axios.get(url, { headers });

          const responses = res.data.data;

          Logger.debug(`轮询结果: ${JSON.stringify(responses)}`, 'SunoService');

          if (action === 'LYRICS') {
            if (responses.status === 'SUCCESS') {
              result.taskId = responses.data.id;
              result.taskData = JSON.stringify(responses.data);
              result.answer = responses.data.text;
              onSuccess(result);
              return;
            }
            result.progress = responses?.progress;
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

                      // 上传音频文件
                      for (const url of validAudioUrls) {
                        try {
                          const uploadedUrl =
                            await this.uploadService.uploadFileFromUrl({
                              url: url,
                              dir: `audio/suno-music/${currentDate}`,
                            });
                          audioUrls.push(uploadedUrl);
                        } catch (error) {
                          Logger.error(
                            `上传音频文件失败: ${error.message}`,
                            'SunoService'
                          );
                          audioUrls.push(url); // 保持原始 URL
                        }
                      }

                      // 上传视频文件
                      for (const url of validVideoUrls) {
                        try {
                          const uploadedUrl =
                            await this.uploadService.uploadFileFromUrl({
                              url: url,
                              dir: `video/suno-music/${currentDate}`,
                            });
                          videoUrls.push(uploadedUrl);
                        } catch (error) {
                          Logger.error(
                            `上传视频文件失败: ${error.message}`,
                            'SunoService'
                          );
                          videoUrls.push(url); // 保持原始 URL
                        }
                      }

                      // 上传图片文件
                      for (const url of validImageUrls) {
                        try {
                          const uploadedUrl =
                            await this.uploadService.uploadFileFromUrl({
                              url: url,
                              dir: `images/suno-music/${currentDate}`,
                            });
                          imageUrls.push(uploadedUrl);
                        } catch (error) {
                          Logger.error(
                            `上传图片文件失败: ${error.message}`,
                            'SunoService'
                          );
                          imageUrls.push(url); // 保持原始 URL
                        }
                      }
                    } else {
                      // 保持原始 URL
                      audioUrls = validAudioUrls;
                      videoUrls = validVideoUrls;
                      imageUrls = validImageUrls;
                    }
                  } catch (error) {
                    Logger.error(
                      `获取配置失败: ${error.message}`,
                      'LumaService'
                    );
                    // 保持原始 URL
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
                  } else {
                    result.status = 2;
                    result.progress = responses?.progress;
                    result.answer = `当前生成进度 ${responses?.progress}`;
                  }

                  Logger.debug(
                    `音乐生成成功: ${JSON.stringify(data)}`,
                    'SunoService'
                  );
                  onSuccess(result);
                  return;
                } else {
                  // 保持原始 URL
                  result.audioUrl = validAudioUrls.join(',');
                  result.videoUrl = validVideoUrls.join(',');
                  result.fileInfo = validImageUrls.join(',');
                  result.status = 2;
                  result.progress = responses?.progress;
                  result.answer = firstTitle;
                  onAudioSuccess(result);
                }
              }
            }

            if (!result.audioUrl && result.progress && result.status === 2) {
              onGenerating(result);
            }
          }
        } catch (error) {
          retryCount++;
          Logger.error(`轮询失败，重试次数: ${retryCount}`, 'SunoService');
        }
      }
      Logger.error('轮询超时，请稍后再试！', 'SunoService');
      result.status = 4;
      onFailure(result);
      throw new Error('查询超时，请稍后再试！');
    } catch (error) {
      Logger.error(`轮询过程中发生错误: ${error}`, 'SunoService');
      result.status = 5;
      onFailure(result);
    }
  }
}
