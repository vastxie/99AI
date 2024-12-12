import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import { GlobalConfigService } from '../globalConfig/globalConfig.service';
import { UploadService } from '../upload/upload.service';
// 引入其他需要的模块或服务

@Injectable()
export class StableDiffusionService {
  private readonly logger = new Logger(StableDiffusionService.name);
  constructor(
    private readonly uploadService: UploadService,
    private readonly globalConfigService: GlobalConfigService
  ) {}

  async sdxl(inputs) {
    const {
      onSuccess,
      onFailure,
      apiKey,
      model,
      proxyUrl,
      modelName,
      timeout,
      chatId,
      prompt,
    } = inputs;
    let result = {
      answer: '',
      model: model,
      modelName: modelName,
      chatId: chatId,
      fileInfo: '',
      status: 2,
    };

    console.log('开始处理', { model, modelName, prompt }); // 打印输入信息

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
      const response = await axios(options);
      console.log('API响应接收', response.data); // 打印API响应

      if (response.data.choices && response.data.choices.length > 0) {
        const choice = response.data.choices[0];
        const content = choice.message.content;
        console.log('处理内容', content); // 打印选项内容

        // 使用正则表达式匹配图片链接
        const regex = /\]\((https?:\/\/[^\)]+)\)/;
        const match = content.match(regex);
        if (match && match[1]) {
          result.fileInfo = match[1]; // 提取链接并存储在fileInfo中
          try {
            const localStorageStatus =
              await this.globalConfigService.getConfigs(['localStorageStatus']);
            if (Number(localStorageStatus)) {
              // 使用 Date 对象获取当前日期并格式化为 YYYYMM/DD
              const now = new Date();
              const year = now.getFullYear();
              const month = String(now.getMonth() + 1).padStart(2, '0'); // 月份从0开始，所以+1
              const day = String(now.getDate()).padStart(2, '0');
              const currentDate = `${year}${month}/${day}`;
              result.fileInfo = await this.uploadService.uploadFileFromUrl({
                url: result.fileInfo,
                dir: `images/stable-diffusion/${currentDate}`,
              });
            }
          } catch (error) {
            Logger.error(
              `上传文件失败: ${error.message}`,
              'StableDiffusionService'
            );
          }
          console.log('找到链接', match[1]); // 打印提取的链接
        } else {
          console.log('没有找到链接');
        }
        result.answer = `${prompt} 绘制成功`;
        if (result.fileInfo) {
          onSuccess(result);
          return;
        } else {
          onFailure('No link found.');
        }
      } else {
        onFailure('No choices returned.');
      }
    } catch (error) {
      Logger.error('服务器错误，请求失败：', error);
    }
  }
}
