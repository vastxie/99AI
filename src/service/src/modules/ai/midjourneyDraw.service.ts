import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import axios, { AxiosResponse } from 'axios';
import { ChatLogService } from '../chatLog/chatLog.service';
import { GlobalConfigService } from '../globalConfig/globalConfig.service';
import { UploadService } from '../upload/upload.service';
// 引入其他需要的模块或服务

@Injectable()
export class MidjourneyService {
  constructor(
    private readonly uploadService: UploadService,
    private readonly globalConfigService: GlobalConfigService,
    private readonly chatLogService: ChatLogService
  ) {}

  /* MJ 绘画 */
  async midjourneyDraw(inputs) {
    const {
      id,
      apiKey,
      proxyUrl,
      action,
      drawId,
      prompt,
      usePrompt,
      customId,
      timeout,
      fileInfo,
      assistantLogId,
    } = inputs;
    let result: any = {
      text: '',
      fileInfo: '',
      drawId: '',
      customId: '',
      status: 2,
    };

    /* 提交绘画任务 */
    let response: AxiosResponse<any, any>;
    let retryCount = 0;
    let url = '';
    const headers = { 'mj-api-secret': apiKey };
    Logger.debug(`当前任务类型: ${action}`, 'MidjourneyService');
    while (retryCount < 3) {
      let payloadJson = {};
      try {
        if (action === 'IMAGINE') {
          url = `${proxyUrl}/mj/submit/imagine`;
          payloadJson = { prompt: usePrompt };
        } else if (action === 'DESCRIBE') {
          url = `${proxyUrl}/mj/submit/describe`;

          if (fileInfo) {
            const response = await fetch(fileInfo);
            const blob = await response.blob();
            const buffer = Buffer.from(await blob.arrayBuffer());
            const base64String = buffer.toString('base64');
            payloadJson = { base64: `data:image/png;base64,${base64String}` };
          } else {
            return;
          }
        } else if (action === 'PICREADER') {
          url = `${proxyUrl}/mj/submit/action`;
          payloadJson = { taskId: drawId, customId: customId };
          response = await axios.post(url, payloadJson, { headers });
          if (response?.status === 200 && response?.data?.result) {
            url = `${proxyUrl}/mj/submit/modal`;
            payloadJson = { taskId: response?.data?.result };
          }
        } else {
          url = `${proxyUrl}/mj/submit/action`;
          payloadJson = { taskId: drawId, customId: customId };
        }

        // 在发送请求之前记录请求的详细信息
        Logger.log(
          `正在准备发送请求到 ${url}，payload: ${JSON.stringify(
            payloadJson
          )}, headers: ${JSON.stringify(headers)}`,
          'MidjourneyService'
        );

        response = await axios.post(url, payloadJson, { headers });

        if (response?.status === 200 && response?.data?.result) {
          Logger.debug(
            `收到响应: ${JSON.stringify(response.data)}`,
            'MidjourneyService'
          );
          result.drawId = response?.data?.result;
          result.state = 2;
          result.answer = '绘画任务提交成功';
          Logger.log(
            `绘画任务提交成功, 绘画ID: ${response.data.result}`,
            'MidjourneyService'
          );
          break;
        } else {
          throw new Error('未能获取结果数据, 即将重试');
        }
      } catch (error) {
        retryCount++;
        if (retryCount >= 3) {
          result.answer = '任务提交失败，请检查提示词后重试';
          result.status = 5;
          Logger.log(
            `绘画任务提交失败, 请检查后台配置或者稍后重试! ${error}`,
            'MidjourneyService'
          );
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
        // 处理成功获取绘图结果的逻辑
        await this.chatLogService.updateChatLog(assistantLogId, {
          fileInfo: data?.fileInfo,
          answer: data?.answer || prompt,
          progress: '100%',
          status: 3,
          drawId: data?.drawId,
          customId: data?.customId,
        });
        Logger.log('绘图成功！', 'MidjourneyService');
      },
      onDrawing: async (data) => {
        // 处理成功获取绘图结果的逻辑
        await this.chatLogService.updateChatLog(assistantLogId, {
          answer: data?.answer || '绘制中',
          progress: data?.progress,
          status: 2,
        });
        Logger.log(`绘制中！绘制进度${data?.progress}`, 'MidjourneyService');
      },
      onFailure: async (data) => {
        // 处理失败逻辑
        await this.chatLogService.updateChatLog(assistantLogId, {
          answer: '绘图失败',
          status: data.status,
        });
        Logger.log('绘图失败', 'MidjourneyService');
      },
    }).catch((error) => {
      Logger.error('查询绘图结果时发生错误:', error, 'MidjourneyService');
    });

    return result;
  }

  async pollMjDrawingResult(inputs) {
    const {
      proxyUrl,
      apiKey,
      drawId,
      timeout,
      onSuccess,
      prompt,
      onFailure,
      onDrawing,
    } = inputs;
    const { mjNotSaveImg, mjProxyImgUrl, mjNotUseProxy } =
      await this.globalConfigService.getConfigs([
        'mjNotSaveImg',
        'mjProxyImgUrl',
        'mjNotUseProxy',
      ]);
    let result: any = {
      fileInfo: '',
      drawId: '',
      customId: '',
      status: 2,
      progress: 0,
      answer: '',
    };
    const startTime = Date.now();
    const POLL_INTERVAL = 5000; // 每5秒查一次
    let retryCount = 0; // 当前重试次数
    try {
      while (Date.now() - startTime < timeout) {
        await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL));
        try {
          const headers = {
            'Content-Type': 'application/x-www-form-urlencoded',
            'mj-api-secret': apiKey,
          };
          const url = `${proxyUrl}/mj/task/${drawId}/fetch`;
          const res = await axios.get(url, { headers });
          const responses = res.data;
          Logger.debug(
            `查询结果: ${JSON.stringify(responses)}`,
            'MidjourneyService'
          );
          if (responses.status === 'SUCCESS') {
            Logger.log(
              `绘制成功, 获取到的URL: ${responses.imageUrl}`,
              'MidjourneyService'
            );

            let processedUrl = responses.imageUrl; // 初始化处理后的URL为原始URL
            const shouldReplaceUrl = mjNotUseProxy === '0' && mjProxyImgUrl; // 判断是否需要替换URL
            let logMessage = ''; // 初始化日志消息变量

            if (shouldReplaceUrl) {
              const newUrlBase = new URL(mjProxyImgUrl);
              const parsedUrl = new URL(responses.imageUrl);
              // 替换协议和域名
              parsedUrl.protocol = newUrlBase.protocol;
              parsedUrl.hostname = newUrlBase.hostname;
              parsedUrl.port = newUrlBase.port ? newUrlBase.port : '';
              processedUrl = parsedUrl.toString();
              logMessage = `使用代理替换后的 URL: ${processedUrl}`;
              Logger.log(logMessage, 'MidjourneyService');
            }

            // 根据 mjNotSaveImg 来判断是否存图
            if (mjNotSaveImg !== '1') {
              try {
                Logger.log(`------> 开始上传图片！！！`, 'MidjourneyService');

                // 使用 Date 对象获取当前日期并格式化为 YYYYMM/DD
                const now = new Date();
                const year = now.getFullYear();
                const month = String(now.getMonth() + 1).padStart(2, '0'); // 月份从0开始，所以+1
                const day = String(now.getDate()).padStart(2, '0');
                const currentDate = `${year}${month}/${day}`;

                processedUrl = await this.uploadService.uploadFileFromUrl({
                  url: processedUrl,
                  dir: `images/midjourney/${currentDate}`,
                });
                logMessage = `上传成功 URL: ${processedUrl}`;
              } catch (uploadError) {
                Logger.error('存储图片失败，使用原始/代理图片链接');
                // 如果上传失败，processedUrl 已经是最新的URL，无需再次赋值
                logMessage = `存储图片失败，使用原始/代理图片链接 ${processedUrl}`;
              }
              Logger.log(logMessage, 'MidjourneyService');
            } else {
              // 如果不保存图片，则直接使用处理后的URL
              logMessage = `不保存图片，使用 URL: ${processedUrl}`;
              Logger.log(logMessage, 'MidjourneyService');
            }

            result.fileInfo = processedUrl;
            result.drawId = responses.id;
            result.customId = JSON.stringify(responses.buttons);
            result.answer = `${prompt}\n${
              responses.finalPrompt || responses.properties.finalPrompt || ''
            }`;
            // result.status = 3;
            onSuccess(result);
            return;
          }
          result.progress = responses?.progress;
          result.answer = `当前绘制进度 ${responses?.progress}`;
          if (result.progress) {
            onDrawing(result);
          }
        } catch (error) {
          retryCount++;
          Logger.error(`轮询过程中发生错误: ${error}`, 'MidjourneyService');
        }
      }
      Logger.error(
        `超过 ${startTime / 1000} s 未完成绘画, 请稍后再试! MidjourneyService`
      );
      result.status = 4;
      onFailure(result);
      throw new HttpException('绘画超时，请稍后再试！', HttpStatus.BAD_REQUEST);
    } catch (error) {
      Logger.error(`绘画失败: ${error} MidjourneyService`);
      result.status = 5;
      onFailure(result);
    }
  }
}
