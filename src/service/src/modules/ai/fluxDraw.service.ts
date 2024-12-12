import { Injectable, Logger } from '@nestjs/common';
import axios, { AxiosRequestConfig } from 'axios';
import { ChatLogService } from '../chatLog/chatLog.service';
import { GlobalConfigService } from '../globalConfig/globalConfig.service';
import { UploadService } from '../upload/upload.service';
import { OpenAIChatService } from './openaiChat.service';
// 引入其他需要的模块或服务

@Injectable()
export class FluxDrawService {
  private readonly logger = new Logger(FluxDrawService.name);
  constructor(
    private readonly uploadService: UploadService,
    private readonly globalConfigService: GlobalConfigService,
    private readonly chatLogService: ChatLogService,
    private readonly openAIChatService: OpenAIChatService
  ) {}

  async fluxDraw(inputs, buildMessageFromParentMessageId) {
    Logger.log('开始提交 Flux 绘图任务 ', 'DrawService');
    const {
      apiKey,
      model,
      proxyUrl,
      prompt,
      extraParam,
      timeout,
      onSuccess,
      onFailure,
      groupId,
    } = inputs;

    const isDalleChat = await this.globalConfigService.getConfigs([
      'isDalleChat',
    ]);
    let drawPrompt;
    if (isDalleChat === '1') {
      try {
        Logger.log('已开启连续绘画模式', 'FluxDraw');
        const { messagesHistory } = await buildMessageFromParentMessageId(
          `参考上文，结合我的需求，给出绘画描述。我的需求是：${prompt}`,
          {
            groupId,
            systemMessage:
              '你是一个绘画提示词生成工具，请根据用户的要求，结合上下文，用一段文字，描述用户需要的绘画需求，不用包含任何礼貌性的寒暄,只需要场景的描述,可以适当联想',
            maxModelTokens: 8000,
            maxRounds: 5,
            fileInfo: '',
          },
          this.chatLogService
        );
        drawPrompt = await this.openAIChatService.chatFree(
          prompt,
          undefined,
          messagesHistory
        );
      } catch (error) {
        console.error('调用chatFree失败：', error);
        drawPrompt = prompt;
      }
    } else {
      drawPrompt = prompt;
    }
    const size = extraParam?.size || '1024x1024';
    let result: any = { answer: '', fileInfo: '', status: 2 };
    try {
      const options: AxiosRequestConfig = {
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
          // response_format: 'b64_json'
        },
      };
      // 记录请求日志
      Logger.log(
        `正在准备发送请求到 ${options.url}，payload: ${JSON.stringify(
          options.data
        )}, headers: ${JSON.stringify(options.headers)}`,
        'FluxDrawService'
      );
      const response: any = await axios(options);
      Logger.debug(`请求成功${JSON.stringify(response.data.data[0])}`);
      Logger.debug(`请求状态${JSON.stringify(response.status)}`);
      const url = response.data.data[0].url;
      try {
        Logger.log(`------> 开始上传图片！！！`, 'DrawService');
        // 上传图片

        // 使用 Date 对象获取当前日期并格式化为 YYYYMM/DD
        const now = new Date();
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0'); // 月份从0开始，所以+1
        const day = String(now.getDate()).padStart(2, '0');
        const currentDate = `${year}${month}/${day}`;
        result.fileInfo = await this.uploadService.uploadFileFromUrl({
          url: url,
          dir: `images/dalle/${currentDate}`,
        });
        Logger.log(`图片上传成功，URL: ${result.fileInfo}`, 'DrawService');
      } catch (error) {
        Logger.error(`上传图片过程中出现错误: ${error}`, 'DrawService');
      }
      let revised_prompt_cn;
      try {
        revised_prompt_cn = await this.openAIChatService.chatFree(
          `根据提示词{${drawPrompt}}, 模拟AI绘画机器人的语气，用中文回复，告诉用户已经画好了`
        );
      } catch (error) {
        revised_prompt_cn = `${prompt} 绘制成功`;
        Logger.error('翻译失败: ', error);
      }
      result.answer = revised_prompt_cn;
      result.status = 3;
      onSuccess(result);
      return;
    } catch (error) {
      result.status = 5;
      onFailure(result);
      const status = error?.response?.status || 500;
      console.log('draw error: ', JSON.stringify(error), status);
      const message = error?.response?.data?.error?.message;
      if (status === 429) {
        result.text = '当前请求已过载、请稍等会儿再试试吧！';
        return result;
      }
      if (
        status === 400 &&
        message.includes('This request has been blocked by our content filters')
      ) {
        result.text = '您的请求已被系统拒绝。您的提示可能存在一些非法的文本。';
        return result;
      }
      if (
        status === 400 &&
        message.includes('Billing hard limit has been reached')
      ) {
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
}
