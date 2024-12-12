import { handleError } from '@/common/utils';
import { Injectable, Logger } from '@nestjs/common';
import axios, { AxiosRequestConfig } from 'axios';
import { GlobalConfigService } from '../globalConfig/globalConfig.service';
// 引入其他需要的模块或服务

@Injectable()
export class OpenAIChatService {
  constructor(private readonly globalConfigService: GlobalConfigService) {}

  async openAIChat(
    messagesHistory: any,
    inputs: {
      chatId: any;
      maxModelTokens?: any;
      apiKey: any;
      model: any;
      modelName: any;
      temperature: any;
      modelType?: any;
      prompt?: any;
      fileInfo?: any;
      isFileUpload: any;
      timeout: any;
      proxyUrl: any;
      modelAvatar?: any;
      onProgress?: any;
      onFailure?: any;
      abortController: AbortController;
    }
  ) {
    const {
      onFailure,
      onProgress,
      apiKey,
      model,
      proxyUrl,
      modelName,
      timeout,
      chatId,
      isFileUpload,
      modelAvatar,
      temperature,
      abortController,
    } = inputs;

    let result: any = {
      text: '',
      model: '',
      modelName: modelName,
      chatId: chatId,
      answer: '',
      errMsg: '',
      modelAvatar: modelAvatar,
    };

    // 请求数据的构建
    const data: any = {
      model,
      messages: messagesHistory,
      ...(isFileUpload === 2 && { max_tokens: 2048 }),
    };

    data.stream = true;
    data.temperature = temperature;

    const options: AxiosRequestConfig = {
      method: 'POST',
      url: `${proxyUrl}/v1/chat/completions`,
      responseType: 'stream',
      timeout: timeout,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      data: data,
    };

    // 在打印日志之前，对请求配置进行清理
    const sanitizedOptions = await this.sanitizeOptionsForLogging(options);

    // 打印清理后的请求配置
    console.log(
      '请求配置:',
      JSON.stringify(sanitizedOptions, null, 2),
      'ChatService'
    );
    console.log(
      '请求配置:',
      JSON.stringify(sanitizedOptions, null, 2),
      'ChatService'
    );

    try {
      const response = await axios(options);

      const stream = response.data;
      let buffer = '';
      await new Promise((resolve, reject) => {
        stream.on('data', (chunk: { toString: () => string }) => {
          buffer += chunk.toString();
          // Logger.log('chunk', chunk.toString());

          let lines = buffer.split('\n');
          buffer = lines.pop();

          lines.forEach((line) => {
            if (line.trim() === 'data: [DONE]') {
              console.log('处理结束信号 [DONE]');
              resolve(result);
              return;
            }
            if (line.startsWith('data: ')) {
              try {
                const cleanedLine = line.slice(6).trim();
                if (cleanedLine) {
                  const jsonLine = JSON.parse(cleanedLine);
                  const content = jsonLine.choices[0]?.delta?.content || '';
                  result.answer += content;
                  onProgress?.({ text: content, answer: result.answer });
                }
              } catch (error) {
                console.error('Error parsing line:', line, error);
              }
            }
          });
        });
        stream.on('end', () => {
          resolve(result);
        });
        stream.on('error', (error: any) => {
          reject(error);
        });
        abortController.signal.addEventListener('abort', () => {
          // Logger.log('用户终止请求', 'ChatService');
          resolve(result);
        });
      });

      return result;
    } catch (error) {
      result.errMsg = handleError(error);
      Logger.error(result.errMsg);
      onFailure(result);
      return result;
    }
  }

  // 对请求配置进行清理，移除或替换敏感数据
  async sanitizeOptionsForLogging(
    options: AxiosRequestConfig
  ): Promise<AxiosRequestConfig> {
    // 深拷贝 options 对象
    const sanitizedOptions = JSON.parse(JSON.stringify(options));

    // 清理 Authorization 头中的敏感数据
    if (sanitizedOptions.headers && sanitizedOptions.headers.Authorization) {
      const authHeader = sanitizedOptions.headers.Authorization;
      if (authHeader.startsWith('Bearer ')) {
        const token = authHeader.slice(7); // 移除 'Bearer ' 前缀
        if (token.length > 10) {
          // 只显示首尾部分字符，中间用****代替
          sanitizedOptions.headers.Authorization = `Bearer ${token.slice(
            0,
            5
          )}****${token.slice(-4)}`;
        }
      }
    }

    // 遍历 messages，检查是否存在 base64 数据或 URL，并替换它们
    if (
      sanitizedOptions.data &&
      sanitizedOptions.data.messages &&
      Array.isArray(sanitizedOptions.data.messages)
    ) {
      sanitizedOptions.data.messages = sanitizedOptions.data.messages.map(
        (message: any) => {
          if (message.content && Array.isArray(message.content)) {
            message.content = message.content.map((content: any) => {
              if (
                content.type === 'image_url' &&
                content.image_url &&
                content.image_url.url
              ) {
                content.image_url.url = 'data:image/***;base64 ... ...'; // 隐藏 Base64 数据或 URL
              }
              return content;
            });
          }
          return message;
        }
      );
    }

    return sanitizedOptions;
  }

  async chatFree(
    prompt: string,
    systemMessage?: string,
    messagesHistory?: any[]
  ) {
    const {
      openaiBaseUrl = '',
      openaiBaseKey = '',
      openaiBaseModel,
    } = await this.globalConfigService.getConfigs([
      'openaiBaseKey',
      'openaiBaseUrl',
      'openaiBaseModel',
    ]);
    const key = openaiBaseKey;
    const proxyUrl = openaiBaseUrl;

    let requestData = [];

    // 如果存在systemMessage，首先添加系统消息
    if (systemMessage) {
      requestData.push({
        role: 'system',
        content: systemMessage,
      });
    }

    // 根据messagesHistory存在与否构建请求数据
    if (messagesHistory && messagesHistory.length > 0) {
      requestData = requestData.concat(messagesHistory); // 使用concat合并，避免直接修改messagesHistory
    } else {
      // 如果没有提供messagesHistory，添加用户的prompt
      requestData.push({
        role: 'user',
        content: prompt,
      });
    }

    const options: AxiosRequestConfig = {
      method: 'POST',
      url: `${proxyUrl}/v1/chat/completions`,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${key}`,
      },
      data: {
        model: openaiBaseModel || 'gpt-3.5-turbo-0125',
        messages: requestData,
      },
    };

    try {
      const response: any = await axios(options);
      Logger.log(
        `全局模型调用成功, 返回结果: ${response?.data.choices[0].message.content}`,
        'ChatService'
      );
      return response?.data.choices[0].message.content;
    } catch (error) {
      console.log('error: ', error);
    }
  }
}
