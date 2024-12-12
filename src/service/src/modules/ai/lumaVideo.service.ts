import { Injectable, Logger } from '@nestjs/common';
import axios, { AxiosResponse } from 'axios';
import { ChatLogService } from '../chatLog/chatLog.service';
import { GlobalConfigService } from '../globalConfig/globalConfig.service';
import { UploadService } from '../upload/upload.service';
// 引入其他需要的模块或服务

@Injectable()
export class LumaVideoService {
  constructor(
    private readonly chatLogService: ChatLogService,
    private readonly globalConfigService: GlobalConfigService,
    private readonly uploadService: UploadService
  ) {}

  async lumaVideo(inputs) {
    const {
      apiKey,
      proxyUrl,
      fileInfo,
      prompt,
      timeout,
      assistantLogId,
      extraParam,
    } = inputs;
    let result: any = {
      text: '',
      fileInfo: '',
      taskId: '',
      taskData: '',
      status: 2,
    };

    /* 提交绘画任务 */
    let response: AxiosResponse<any, any> | null = null;
    let url = '';
    let payloadJson = {};
    const headers = { Authorization: `Bearer ${apiKey}` };

    url = `${proxyUrl}/luma/generations/`;
    const aspectRatio = extraParam.size || '16:9';
    payloadJson = {
      user_prompt: prompt,
      aspect_ratio: aspectRatio,
      expand_prompt: true,
    };

    // 如果 fileInfo 存在，则添加 image_url 属性
    if (fileInfo) {
      payloadJson['image_url'] = fileInfo;
    }

    Logger.log(
      `正在准备发送请求到 ${url}，payload: ${JSON.stringify(
        payloadJson
      )}, headers: ${JSON.stringify(headers)}`,
      'LumaService'
    );

    try {
      response = await axios.post(url, payloadJson, { headers });
      // Logger.debug(
      //   `任务提交结果，状态码: ${response.status}, 状态消息: ${
      //     response.statusText
      //   }, 数据: ${JSON.stringify(response.data)}`
      // );
    } catch (error) {
      Logger.error(`任务提交失败: ${error.message}`, 'LumaService');
      throw new Error('任务提交失败');
    }

    if (response?.data?.id) {
      result.taskId = response?.data?.id;
      Logger.log(`任务提交成功, 任务ID: ${response?.data?.id}`, 'LumaService');
    } else {
      throw new Error('未能获取结果数据, 即将重试');
    }

    try {
      await this.pollLumaVideoResult({
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
            Logger.log('视频任务已完成', 'LumaService');
          } catch (error) {
            Logger.error(`更新日志失败: ${error.message}`, 'LumaService');
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
            Logger.log('视频生成中...', 'LumaService');
          } catch (error) {
            Logger.error(`更新日志失败: ${error.message}`, 'LumaService');
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
            Logger.error(`更新日志失败: ${error.message}`, 'LumaService');
          }
        },
      });
    } catch (error) {
      Logger.error('查询生成结果时发生错误:', error.message, 'LumaService');
      throw new Error('查询生成结果时发生错误');
    }
    return result;
  }

  async pollLumaVideoResult(inputs) {
    const {
      proxyUrl,
      apiKey,
      taskId,
      timeout,
      onSuccess,
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
    const url = `${proxyUrl}/luma/generations/${taskId}`;
    const startTime = Date.now();
    const totalDuration = 300000;
    const POLL_INTERVAL = 5000; // 每5秒查一次
    let retryCount = 0; // 当前重试次数

    try {
      while (Date.now() - startTime < timeout) {
        await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL));

        try {
          // Logger.debug(url, 'LumaService');
          const res = await axios.get(url, { headers });

          const interval = setInterval(() => {
            const elapsed = Date.now() - startTime;
            let percentage = Math.floor((elapsed / totalDuration) * 100);
            if (percentage >= 99) percentage = 99; // 最多显示99%
            result.answer = `视频生成中 （${percentage}%）`;
            // onGenerate(result);
          }, 1000); // 每秒更新一次进度

          const responses = res.data;

          Logger.debug(`轮询结果: ${JSON.stringify(responses)}`, 'LumaService');

          if (responses.state === 'completed') {
            result.taskId = responses.id;
            result.taskData = JSON.stringify(responses);
            result.fileInfo = responses.video.url;

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
                  url: responses.video.download_url,
                  dir: `video/luma/${currentDate}`,
                });
              }
            } catch (error) {
              Logger.error(`上传文件失败: ${error.message}`, 'LumaService');
            }

            result.answer = `提示词: "${responses.prompt}"`;
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
          Logger.error(`轮询失败，重试次数: ${retryCount}`, 'LumaService');
        }
      }
      Logger.error('轮询超时，请稍后再试！', 'LumaService');
      result.status = 4;
      onFailure(result);
      throw new Error('查询超时，请稍后再试！');
    } catch (error) {
      Logger.error(`轮询过程中发生错误: ${error}`, 'LumaService');
      result.status = 5;
      onFailure(result);
    }
  }

  // async lumaVideo(inputs) {
  //   Logger.log('开始生成视频', 'LumaVideo');
  //   const {
  //     onGenerate,
  //     onFailure,
  //     onSuccess,
  //     apiKey,
  //     model,
  //     proxyUrl,
  //     timeout,
  //     prompt,
  //   } = inputs;
  //   let result = { answer: '', fileInfo: '', errMsg: '' };
  //   let fullText = ''; // 用于累积content内容
  //   const totalDuration = 180000;
  //   const startTime = Date.now(); // 记录开始时间

  //   const options: AxiosRequestConfig = {
  //     method: 'POST',
  //     url: `${proxyUrl}/v1/chat/completions`,
  //     responseType: 'stream',
  //     timeout: timeout,
  //     headers: {
  //       'Content-Type': 'application/json',
  //       Authorization: `Bearer ${apiKey}`,
  //     },
  //     data: {
  //       stream: true,
  //       model,
  //       messages: [
  //         {
  //           role: 'user',
  //           content: prompt,
  //         },
  //       ],
  //     },
  //   };

  //   try {
  //     Logger.debug('请求参数', JSON.stringify(options, null, 2)); // 格式化并打印JSON请求参数
  //     const response = await axios(options);
  //     const stream = response.data;

  //     const interval = setInterval(() => {
  //       const elapsed = Date.now() - startTime;
  //       let percentage = Math.floor((elapsed / totalDuration) * 100);
  //       if (percentage >= 99) percentage = 99; // 最多显示99%
  //       result.answer = `视频生成中 （${percentage}%）`;
  //       onGenerate(result);
  //     }, 1000); // 每秒更新一次进度

  //     await new Promise((resolve, reject) => {
  //       stream.on('data', (chunk) => {
  //         Logger.log('生成进度: ', fullText);
  //         const splitArr = chunk
  //           .toString()
  //           .split('\n\n')
  //           .filter((line) => line.trim());

  //         splitArr.forEach((line) => {
  //           try {
  //             if (line.trim() === 'data: [DONE]') {
  //               return;
  //             }

  //             // 提取视频链接
  //             const videoLinkMatch = line.match(
  //               /\[在线播放▶️\]\((https?:\/\/[^\)]+\.mp4)\)/
  //             );
  //             if (videoLinkMatch) {
  //               clearInterval(interval); // 视频生成完成时清除定时器
  //               result.fileInfo = videoLinkMatch[1]; // 确保赋值给正确的属性
  //               const userPromptMatch = fullText.match(
  //                 /"user_prompt":\s*"(.*?)"/
  //               );
  //               if (userPromptMatch) {
  //                 result.answer = `提示词: "${userPromptMatch[1]}"`;
  //               } else {
  //                 result.answer = '无法提取提示词';
  //               }
  //               onSuccess(result);
  //               return;
  //             }

  //             const jsonLine = JSON.parse(line.replace(/^data: /, '').trim());
  //             const content = jsonLine.choices[0]?.delta?.content || '';
  //             fullText += content; // 累积到fullText中

  //             // 根据fullText更新result.text
  //             if (!fullText.includes('user_prompt')) {
  //               if (fullText.includes('生成中..')) {
  //                 result.answer = '视频生成中';
  //                 onGenerate(result);
  //               } else if (fullText.includes('排队中.')) {
  //                 result.answer = '排队中';
  //                 onGenerate(result);
  //               } else {
  //                 result.answer = '提交成功，视频生成中';
  //                 onGenerate(result);
  //               }
  //             }
  //           } catch (error) {
  //             console.error('Parse error', error, line);
  //           }
  //         });
  //       });

  //       stream.on('end', () => {
  //         clearInterval(interval); // 流结束时清除定时器
  //         Logger.log('Stream ended'); // 日志：流结束
  //         resolve(result); // 注意：这里仍然需要等待流式处理完全完成才能解决Promise
  //       });

  //       stream.on('error', (error) => {
  //         clearInterval(interval); // 出现错误时清除定时器
  //         Logger.error('Stream error:', error); // 日志：流错误
  //         reject(error);
  //       });
  //     });
  //     return result;
  //   } catch (error) {
  //     result.errMsg = await handleError(error);
  //     Logger.error(result.errMsg);
  //     onFailure(result);
  //     return;
  //   }
  // }
}
