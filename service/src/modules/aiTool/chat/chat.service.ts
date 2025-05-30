import { handleError } from '@/common/utils';
import { correctApiBaseUrl } from '@/common/utils/correctApiBaseUrl';
import { Injectable, Logger } from '@nestjs/common';
import OpenAI from 'openai';
import { GlobalConfigService } from '../../globalConfig/globalConfig.service';
import { NetSearchService } from '../search/netSearch.service';
// 引入其他需要的模块或服务

@Injectable()
export class OpenAIChatService {
  constructor(
    private readonly globalConfigService: GlobalConfigService,
    private readonly netSearchService: NetSearchService,
  ) {}

  /**
   * 处理深度思考逻辑
   * @param messagesHistory 消息历史
   * @param inputs 输入参数
   * @param result 结果对象
   * @returns 是否应该终止请求
   */
  private async handleDeepThinking(
    messagesHistory: any,
    inputs: {
      apiKey: any;
      model: any;
      proxyUrl: any;
      timeout: any;
      usingDeepThinking?: boolean;
      deepThinkingModel?: string;
      deepThinkingUrl?: string;
      deepThinkingKey?: string;
      searchResults?: any[];
      deepThinkingType?: any;
      abortController: AbortController;
      onProgress?: (data: any) => void;
    },
    result: any,
  ): Promise<boolean> {
    const {
      apiKey,
      model,
      proxyUrl,
      timeout,
      usingDeepThinking,
      searchResults,
      abortController,
      deepThinkingType,
      onProgress,
    } = inputs;

    const {
      openaiBaseUrl,
      openaiBaseKey,
      openaiBaseModel,
      deepThinkingUrl,
      deepThinkingKey,
      deepThinkingModel,
    } = await this.globalConfigService.getConfigs([
      'openaiBaseUrl',
      'openaiBaseKey',
      'openaiBaseModel',
      'deepThinkingUrl',
      'deepThinkingKey',
      'deepThinkingModel',
    ]);

    // 如果不使用深度思考且不是DeepSeek模型，直接返回
    if (!usingDeepThinking && deepThinkingType !== 2) {
      return false;
    }

    const deepUrl = deepThinkingType === 2 ? proxyUrl : deepThinkingUrl || openaiBaseUrl;
    const deepKey = deepThinkingType === 2 ? apiKey : deepThinkingKey || openaiBaseKey;
    const deepModel = deepThinkingType === 2 ? model : deepThinkingModel || openaiBaseModel;

    let shouldEndThinkStream = false;
    let thinkingSourceType = null; // 'reasoning_content' 或 'think_tag'

    // 处理所有消息中的imageUrl类型
    const processedMessages = JSON.parse(JSON.stringify(messagesHistory)).map((message: any) => {
      if (message.role === 'user' && Array.isArray(message.content)) {
        // 将带有image_url类型的内容转换为普通文本
        message.content = message.content
          .filter((item: any) => item.type !== 'image_url')
          .map((item: any) => item.text || item)
          .join('');
      }
      return message;
    });

    // 添加文件向量搜索、图片描述和MCP工具结果到system消息
    const systemMessageIndex = processedMessages.findIndex((msg: any) => msg.role === 'system');
    let additionalContent = '';

    // 如果有网络搜索结果，添加到system消息中
    if (searchResults && searchResults.length > 0) {
      // 将 searchResult 转换为 JSON 字符串
      let searchPrompt = JSON.stringify(searchResults, null, 2);

      additionalContent += `\n\n以下是网络搜索结果（请基于这些信息回答用户问题，这些信息比你的训练数据更新）：\n${searchPrompt}`;
    }

    // 将额外内容添加到system消息中
    if (systemMessageIndex !== -1) {
      processedMessages[systemMessageIndex].content += additionalContent;
    } else if (additionalContent) {
      processedMessages.unshift({
        role: 'system',
        content: additionalContent,
      });
    }

    const correctedDeepUrl = await correctApiBaseUrl(deepUrl);
    const thinkOpenai = new OpenAI({
      apiKey: deepKey,
      baseURL: correctedDeepUrl,
      timeout: timeout * 5,
    });

    Logger.debug(
      `思考流请求 - Messages: ${JSON.stringify(processedMessages)}`,
      'OpenAIChatService',
    );

    // 构建请求配置
    const requestConfig: any = {
      model: deepModel,
      messages: processedMessages,
      stream: true,
    };

    // 如果是 grok-3-mini-latest 模型，添加 reasoning_effort 参数
    // if (deepModel === 'grok-3-mini-latest') {
    //   requestConfig.reasoning_effort = 'high';
    //   Logger.debug('为grok-3-mini-latest模型添加reasoning_effort=high参数', 'OpenAIChatService');
    // }

    const stream = await thinkOpenai.chat.completions.create(requestConfig, {
      signal: abortController.signal,
    });

    // @ts-ignore - 忽略TypeScript错误，因为我们知道stream是可迭代的
    for await (const chunk of stream) {
      if (abortController.signal.aborted || shouldEndThinkStream) {
        break;
      }
      const delta = chunk.choices[0]?.delta;
      Logger.debug(`思考流delta: ${JSON.stringify(delta)}`, 'OpenAIChatService');
      const content = delta?.content;
      const reasoning_content = (delta as any)?.reasoning_content || '';

      // 根据已确定的思考流来源类型处理数据
      if (thinkingSourceType === 'reasoning_content') {
        // 已确定使用reasoning_content字段
        if (reasoning_content) {
          Logger.debug(
            `继续接收reasoning_content思考流: ${reasoning_content}`,
            'OpenAIChatService',
          );
          result.reasoning_content = [
            {
              type: 'text',
              text: reasoning_content,
            },
          ];
          result.full_reasoning_content += reasoning_content;
          onProgress?.({
            reasoning_content: result.reasoning_content,
          });
        } else if (content && !content.includes('<think>')) {
          // 如果出现普通content，对于非DeepSeek模型终止思考流
          // 对于DeepSeek模型，将内容作为正常响应处理
          Logger.debug(`reasoning_content模式下收到普通content: ${content}`, 'OpenAIChatService');
          if (deepThinkingType === 2) {
            result.content = [
              {
                type: 'text',
                text: content,
              },
            ];
            result.full_content += content;
            onProgress?.({
              content: result.content,
            });
          } else {
            shouldEndThinkStream = true;
          }
        }
        continue;
      } else if (thinkingSourceType === 'think_tag') {
        // 已确定使用think标签
        if (content) {
          if (content.includes('</think>')) {
            // 如果包含结束标签，提取剩余思考内容
            Logger.debug(`检测到</think>标签，思考流结束`, 'OpenAIChatService');
            const regex = /([\s\S]*?)<\/think>([\s\S]*)/;
            const matches = content.match(regex);

            if (matches) {
              const thinkContent = matches[1] || '';
              const remainingContent = matches[2] || '';

              if (thinkContent) {
                result.reasoning_content = [
                  {
                    type: 'text',
                    text: thinkContent,
                  },
                ];
                result.full_reasoning_content += thinkContent;
                onProgress?.({
                  reasoning_content: result.reasoning_content,
                });
              }

              // 对于DeepSeek模型，如果有剩余内容，作为正常响应处理
              if (deepThinkingType === 2 && remainingContent) {
                result.content = [
                  {
                    type: 'text',
                    text: remainingContent,
                  },
                ];
                result.full_content += remainingContent;
                onProgress?.({
                  content: result.content,
                });
              }
            }

            // 对于非DeepSeek模型，终止思考流
            // 对于DeepSeek模型，只标记思考流结束，但继续处理后续内容
            if (deepThinkingType !== 2) {
              shouldEndThinkStream = true;
            } else {
              thinkingSourceType = 'normal_content';
            }
          } else {
            // 继续接收think标签内的思考内容
            Logger.debug(`继续接收think标签思考流: ${content}`, 'OpenAIChatService');
            result.reasoning_content = [
              {
                type: 'text',
                text: content,
              },
            ];
            result.full_reasoning_content += content;
            onProgress?.({
              reasoning_content: result.reasoning_content,
            });
          }
        }
        continue;
      } else if (thinkingSourceType === 'normal_content' && deepThinkingType === 2) {
        // DeepSeek模型在思考流结束后的正常内容处理
        if (content) {
          result.content = [
            {
              type: 'text',
              text: content,
            },
          ];
          result.full_content += content;
          onProgress?.({
            content: result.content,
          });
        }
        continue;
      }

      // 尚未确定思考流来源类型，进行检测
      if (reasoning_content) {
        // 确定使用reasoning_content字段作为思考流
        Logger.debug(
          `首次检测到reasoning_content，确定使用reasoning_content思考流方式: ${reasoning_content}`,
          'OpenAIChatService',
        );
        thinkingSourceType = 'reasoning_content';
        result.reasoning_content = [
          {
            type: 'text',
            text: reasoning_content,
          },
        ];
        result.full_reasoning_content += reasoning_content;
        onProgress?.({
          reasoning_content: result.reasoning_content,
        });
      } else if (content) {
        if (content.includes('<think>')) {
          // 确定使用think标签作为思考流
          Logger.debug(`首次检测到<think>标签，确定使用think标签思考流方式`, 'OpenAIChatService');
          thinkingSourceType = 'think_tag';

          // 提取第一个块中的内容
          const thinkContent = content.replace(/<think>/, '');
          if (thinkContent) {
            Logger.debug(`从<think>标签中提取的初始思考内容: ${thinkContent}`, 'OpenAIChatService');
            result.reasoning_content = [
              {
                type: 'text',
                text: thinkContent,
              },
            ];
            result.full_reasoning_content += thinkContent;
            onProgress?.({
              reasoning_content: result.reasoning_content,
            });

            // 如果已经包含了</think>标签，提取思考内容和剩余内容
            if (content.includes('</think>')) {
              Logger.debug('在首个块中检测到</think>标签', 'OpenAIChatService');

              const regex = /<think>([\s\S]*?)<\/think>([\s\S]*)/;
              const matches = content.match(regex);

              if (matches) {
                const fullThinkContent = matches[1] || '';
                const remainingContent = matches[2] || '';

                // 更新思考内容
                result.reasoning_content = [
                  {
                    type: 'text',
                    text: fullThinkContent,
                  },
                ];
                result.full_reasoning_content = fullThinkContent;
                onProgress?.({
                  reasoning_content: result.reasoning_content,
                });

                // 对于DeepSeek模型，如果有剩余内容，作为正常响应处理
                if (deepThinkingType === 2 && remainingContent) {
                  result.content = [
                    {
                      type: 'text',
                      text: remainingContent,
                    },
                  ];
                  result.full_content += remainingContent;
                  onProgress?.({
                    content: result.content,
                  });
                }
              }

              // 对于非DeepSeek模型，终止思考流
              // 对于DeepSeek模型，只标记思考流结束，继续处理后续内容
              if (deepThinkingType !== 2) {
                shouldEndThinkStream = true;
              } else {
                thinkingSourceType = 'normal_content';
              }
            }
          }
        } else {
          // 没有任何思考流标记，不同模型有不同处理
          Logger.debug(`没有检测到思考流标记，处理普通内容: ${content}`, 'OpenAIChatService');

          if (deepThinkingType === 2) {
            // DeepSeek模型直接处理为正常内容
            thinkingSourceType = 'normal_content';
            result.content = [
              {
                type: 'text',
                text: content,
              },
            ];
            result.full_content += content;
            onProgress?.({
              content: result.content,
            });
          } else {
            // 非DeepSeek模型终止思考流
            shouldEndThinkStream = true;
          }
        }
      }
    }

    Logger.debug('思考流处理完成', 'OpenAIChatService');

    // 如果是DeepSeek模型并且有内容，直接返回true表示应该终止请求
    return deepThinkingType === 2 && result.full_content.length > 0;
  }

  /**
   * 处理常规响应逻辑
   * @param messagesHistory 消息历史
   * @param inputs 输入参数
   * @param result 结果对象
   */
  private async handleRegularResponse(
    messagesHistory: any,
    inputs: {
      apiKey: any;
      model: any;
      proxyUrl: any;
      timeout: any;
      temperature: any;
      max_tokens?: any;
      extraParam?: any;
      searchResults?: any[];
      images?: string[];
      abortController: AbortController;
      onProgress?: (data: any) => void;
    },
    result: any,
  ): Promise<void> {
    const {
      apiKey,
      model,
      proxyUrl,
      timeout,
      temperature,
      max_tokens,
      searchResults,
      images,
      abortController,
      onProgress,
    } = inputs;

    // 步骤1: 准备和增强系统消息
    const processedMessages = this.prepareSystemMessage(
      messagesHistory,
      {
        searchResults,
        images,
      },
      result,
    );

    // 步骤2: 处理OpenAI聊天API调用
    await this.handleOpenAIChat(
      processedMessages,
      {
        apiKey,
        model,
        proxyUrl,
        timeout,
        temperature,
        max_tokens,
        abortController,
        onProgress,
      },
      result,
    );
  }

  async chat(
    messagesHistory: any,
    inputs: {
      chatId: any;
      maxModelTokens?: any;
      max_tokens?: any;
      apiKey: any;
      model: any;
      modelName: any;
      temperature: any;
      modelType?: any;
      prompt?: any;
      imageUrl?: any;
      isFileUpload: any;
      isImageUpload?: any;
      fileUrl?: any;
      usingNetwork?: boolean;
      timeout: any;
      proxyUrl: any;
      modelAvatar?: any;
      usingDeepThinking?: boolean;
      usingMcpTool?: boolean;
      isMcpTool?: boolean;
      extraParam?: any;
      deepThinkingType?: any;
      onProgress?: (data: {
        text?: string;
        content?: [];
        reasoning_content?: [];
        tool_calls?: string;
        networkSearchResult?: string;
        finishReason?: string;
        // full_json?: string; // 编辑模式相关，已注释
      }) => void;
      onFailure?: (error: any) => void;
      onDatabase?: (data: any) => void;
      abortController: AbortController;
    },
  ) {
    const {
      chatId,
      maxModelTokens,
      max_tokens,
      apiKey,
      model,
      modelName,
      temperature,
      prompt,
      timeout,
      proxyUrl,
      modelAvatar,
      usingDeepThinking,
      usingNetwork,
      extraParam,
      deepThinkingType,
      onProgress,
      onFailure,
      onDatabase,
      abortController,
    } = inputs;

    // 创建原始消息历史的副本
    const originalMessagesHistory = JSON.parse(JSON.stringify(messagesHistory));

    const result: any = {
      chatId,
      modelName,
      modelAvatar,
      model,
      status: 2,
      full_content: '',
      full_reasoning_content: '',
      networkSearchResult: '',
      fileVectorResult: '',
      finishReason: null,
    };

    try {
      // 步骤1: 处理网络搜索 - 使用NetSearchService
      const { searchResults, images } = await this.netSearchService.processNetSearch(
        prompt || '',
        {
          usingNetwork,
          onProgress,
          onDatabase,
        },
        result,
      );

      // 步骤5: 处理深度思考
      const shouldEndRequest = await this.handleDeepThinking(
        messagesHistory,
        {
          apiKey,
          model,
          proxyUrl,
          timeout,
          usingDeepThinking,
          searchResults,
          abortController,
          deepThinkingType,
          onProgress,
        },
        result,
      );

      // 如果深度思考处理后应该终止请求，则直接返回结果
      if (shouldEndRequest) {
        result.content = '';
        result.reasoning_content = '';
        result.finishReason = 'stop';
        return result;
      }

      // 步骤6: 处理常规响应
      await this.handleRegularResponse(
        originalMessagesHistory,
        {
          apiKey,
          model,
          proxyUrl,
          timeout,
          temperature,
          max_tokens,
          extraParam,
          searchResults,
          images,
          abortController,
          onProgress,
        },
        result,
      );

      result.content = [
        {
          type: 'text',
          text: '',
        },
      ];
      result.reasoning_content = [
        {
          type: 'text',
          text: '',
        },
      ];
      result.finishReason = 'stop';

      return result;
    } catch (error) {
      const errorMessage = handleError(error);
      Logger.error(`对话请求失败: ${errorMessage}`, 'OpenAIChatService');
      result.errMsg = errorMessage;
      onFailure?.(result);
      return result;
    }
  }

  async chatFree(prompt: string, systemMessage?: string, messagesHistory?: any[], imageUrl?: any) {
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

    if (systemMessage) {
      requestData.push({
        role: 'system',
        content: systemMessage,
      });
    }

    if (messagesHistory && messagesHistory.length > 0) {
      requestData = requestData.concat(messagesHistory);
    } else {
      if (imageUrl) {
        requestData.push({
          role: 'user',
          content: [
            {
              type: 'text',
              text: prompt,
            },
            {
              type: 'image_url',
              image_url: {
                url: imageUrl,
              },
            },
          ],
        });
      } else {
        requestData.push({
          role: 'user',
          content: prompt,
        });
      }
    }

    try {
      const openai = new OpenAI({
        apiKey: key,
        baseURL: await correctApiBaseUrl(proxyUrl),
      });

      const response = await openai.chat.completions.create(
        {
          model: openaiBaseModel || 'gpt-4o-mini',
          messages: requestData,
        },
        {
          timeout: 30000,
        },
      );

      return response.choices[0].message.content;
    } catch (error) {
      const errorMessage = handleError(error);
      Logger.error(`全局模型调用失败: ${errorMessage}`, 'OpenAIChatService');
      return;
    }
  }

  /**
   * 准备和增强系统消息
   * @param messagesHistory 消息历史
   * @param inputs 输入参数
   * @param result 结果对象
   * @returns 处理后的消息历史
   */
  private prepareSystemMessage(
    messagesHistory: any,
    inputs: {
      searchResults?: any[];
      images?: string[];
    },
    result: any,
  ): any {
    const { searchResults, images } = inputs;

    // 创建消息历史的副本
    const processedMessages = JSON.parse(JSON.stringify(messagesHistory));

    // 查找系统消息
    const systemMessage = processedMessages?.find((message: any) => message.role === 'system');

    if (systemMessage) {
      const imageUrlMessages =
        processedMessages?.filter((message: any) => message.type === 'image_url') || [];

      let updatedContent = '';

      // 添加推理思考内容
      if (result.full_reasoning_content) {
        updatedContent = `\n\n以下是针对这个问题的思考推理思路（思路不一定完全正确，仅供参考）：\n${result.full_reasoning_content}`;
      }

      // 添加网络搜索结果
      if (searchResults && searchResults.length > 0) {
        // 将 searchResult 转换为 JSON 字符串
        let searchPrompt = JSON.stringify(searchResults, null, 2); // 格式化为漂亮的 JSON 字符串

        // 处理图片数据
        let imagesPrompt = '';
        if (images && images.length > 0) {
          imagesPrompt = `\n\n以下是搜索到的相关图片链接:\n${images.join('\n')}`;
        }

        const now = new Date();
        const options = {
          timeZone: 'Asia/Shanghai', // 设置时区为 'Asia/Shanghai'（北京时间）
          year: 'numeric' as const,
          month: '2-digit' as const,
          day: '2-digit' as const,
          hour: '2-digit' as const,
          minute: '2-digit' as const,
          hour12: false, // 使用24小时制
        };

        const currentDate = new Intl.DateTimeFormat('zh-CN', options).format(now);

        updatedContent += `
          \n\n你的任务是根据用户的问题，通过下面的搜索结果提供更精确、详细、具体的回答。
          请在适当的情况下在对应部分句子末尾标注引用的链接，使用[[序号](链接地址)]格式，同时使用多个链接可连续使用比如[[2](链接地址)][[5](链接地址)]，以下是搜索结果：
            ${searchPrompt}${imagesPrompt}
            在回答时，请注意以下几点：
              - 现在时间是: ${currentDate}。
              - 如果结果中包含图片链接，可在适当位置使用MarkDown格式插入至少一张图片，让回答图文并茂。
              - 并非搜索结果的所有内容都与用户的问题密切相关，你需要结合问题，对搜索结果进行甄别、筛选。
              - 对于列举类的问题（如列举所有航班信息），尽量将答案控制在10个要点以内，并告诉用户可以查看搜索来源、获得完整信息。优先提供信息完整、最相关的列举项；如非必要，不要主动告诉用户搜索结果未提供的内容。
              - 对于创作类的问题（如写论文），请务必在正文的段落中引用对应的参考编号。你需要解读并概括用户的题目要求，选择合适的格式，充分利用搜索结果并抽取重要信息，生成符合用户要求、极具思想深度、富有创造力与专业性的答案。你的创作篇幅需要尽可能延长，对于每一个要点的论述要推测用户的意图，给出尽可能多角度的回答要点，且务必信息量大、论述详尽。
              - 如果回答很长，请尽量结构化、分段落总结。如果需要分点作答，尽量控制在5个点以内，并合并相关的内容。
              - 对于客观类的问答，如果问题的答案非常简短，可以适当补充一到两句相关信息，以丰富内容。
              - 你需要根据用户要求和回答内容选择合适、美观的回答格式，确保可读性强。
              - 你的回答应该综合多个相关网页来回答，不能只重复引用一个网页。
              - 除非用户要求，否则你回答的语言需要和用户提问的语言保持一致。
            `;
      }

      // 添加图片URL消息
      if (imageUrlMessages && imageUrlMessages.length > 0) {
        imageUrlMessages.forEach((imageMessage: any) => {
          updatedContent = `${updatedContent}\n${JSON.stringify(imageMessage)}`;
        });
      }

      systemMessage.content += updatedContent;
    }

    return processedMessages;
  }

  /**
   * 处理OpenAI聊天API调用和流式响应
   * @param messagesHistory 处理后的消息历史
   * @param inputs 输入参数
   * @param result 结果对象
   */
  private async handleOpenAIChat(
    messagesHistory: any,
    inputs: {
      apiKey: any;
      model: any;
      proxyUrl: any;
      timeout: any;
      temperature: any;
      max_tokens?: any;
      abortController: AbortController;
      onProgress?: (data: any) => void;
    },
    result: any,
  ): Promise<void> {
    const {
      apiKey,
      model,
      proxyUrl,
      timeout,
      temperature,
      max_tokens,
      abortController,
      onProgress,
    } = inputs;

    // 准备请求数据
    const streamData = {
      model,
      messages: messagesHistory,
      stream: true,
      temperature,
    };

    // 创建OpenAI实例
    const openai = new OpenAI({
      apiKey: apiKey,
      baseURL: await correctApiBaseUrl(proxyUrl),
      timeout: timeout,
    });

    try {
      Logger.debug(
        `对话请求 - Messages: ${JSON.stringify(streamData.messages)}`,
        'OpenAIChatService',
      );

      // 发送流式请求
      const stream = await openai.chat.completions.create(
        {
          model: streamData.model,
          messages: streamData.messages,
          stream: true,
          max_tokens: max_tokens,
          temperature: streamData.temperature,
        },
        {
          signal: abortController.signal,
        },
      );

      // 处理流式响应
      for await (const chunk of stream) {
        if (abortController.signal.aborted) {
          break;
        }

        const content = chunk.choices[0]?.delta?.content || '';

        if (content) {
          // 处理流式内容
          result.content = [
            {
              type: 'text',
              text: content,
            },
          ];

          result.full_content += content;
          onProgress?.({
            content: result.content,
          });
        }
      }
    } catch (error) {
      Logger.error(`OpenAI请求失败: ${handleError(error)}`, 'OpenAIChatService');
      throw error;
    }
  }
}
