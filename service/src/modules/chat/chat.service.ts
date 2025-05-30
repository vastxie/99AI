import {
  convertUrlToBase64,
  correctApiBaseUrl,
  formatUrl,
  getClientIp,
  getTokenCount,
  removeThinkTags,
} from '@/common/utils';
import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Request, Response } from 'express';
import { OpenAI } from 'openai';
import { In, Repository } from 'typeorm';
import { OpenAIChatService } from '../aiTool/chat/chat.service';
import { AppEntity } from '../app/app.entity';
import { AppService } from '../app/app.service';
import { AutoReplyService } from '../autoReply/autoReply.service';
import { BadWordsService } from '../badWords/badWords.service';
import { ChatGroupService } from '../chatGroup/chatGroup.service';
import { ChatLogService } from '../chatLog/chatLog.service';
import { GlobalConfigService } from '../globalConfig/globalConfig.service';
import { ModelsService } from '../models/models.service';
import { PluginEntity } from '../plugin/plugin.entity';
import { UploadService } from '../upload/upload.service';
import { UserService } from '../user/user.service';
import { UserBalanceService } from '../userBalance/userBalance.service';

@Injectable()
export class ChatService {
  constructor(
    @InjectRepository(AppEntity)
    private readonly appEntity: Repository<AppEntity>,
    @InjectRepository(PluginEntity)
    private readonly pluginEntity: Repository<PluginEntity>,
    private readonly openAIChatService: OpenAIChatService,
    private readonly chatLogService: ChatLogService,
    private readonly userBalanceService: UserBalanceService,
    private readonly userService: UserService,
    private readonly uploadService: UploadService,
    private readonly badWordsService: BadWordsService,
    private readonly autoReplyService: AutoReplyService,
    private readonly globalConfigService: GlobalConfigService,
    private readonly chatGroupService: ChatGroupService,
    private readonly modelsService: ModelsService,
    private readonly appService: AppService,
  ) {}

  async chatProcess(body: any, req?: Request, res?: Response) {
    await this.userBalanceService.checkUserCertification(req.user.id);
    /* 获取对话参数 */
    const {
      options = {},
      usingPluginId,
      appId = null,
      prompt,
      fileUrl,
      imageUrl,
      extraParam,
      model,
      action,
      modelName,
      modelAvatar,
    } = body;

    Logger.debug(`body: ${JSON.stringify(body)}`, 'ChatService');

    // 获取应用信息
    let appInfo;
    if (appId) {
      Logger.debug(`正在使用应用ID: ${appId}`);
      appInfo = await this.appEntity.findOne({
        where: { id: appId, status: In([1, 3, 4, 5]) },
      });

      if (!appInfo) {
        throw new HttpException(
          '你当前使用的应用已被下架、请删除当前对话开启新的对话吧！',
          HttpStatus.BAD_REQUEST,
        );
      }

      // 检查应用是否为会员专属
      const isAppMemberOnly = await this.appService.checkAppIsMemberOnly(Number(appId));
      if (isAppMemberOnly) {
        Logger.debug(`检测到会员专属应用: ${isAppMemberOnly}`);
        const userCatIds = await this.userBalanceService.getUserApps(req.user.id);
        Logger.debug(`用户权限分类: ${userCatIds.join(',')}`);

        // 获取应用所属的分类ID列表
        const appCatIds = appInfo.catId.split(',').map(id => id.trim());
        Logger.debug(`应用所属分类: ${appCatIds.join(',')}`);

        const hasMatchingCategory = appCatIds.some(catId => userCatIds.includes(catId));

        if (!hasMatchingCategory) {
          throw new HttpException(
            '你当前使用的应用为会员专属应用，请先开通会员！',
            HttpStatus.PAYMENT_REQUIRED,
          );
        }
      }
    }

    const { groupId, usingNetwork, usingDeepThinking, usingMcpTool } = options;

    const {
      openaiBaseUrl,
      openaiBaseKey,
      systemPreMessage,
      openaiTemperature,
      openaiBaseModel,
      isGeneratePromptReference,
      isConvertToBase64,
      isSensitiveWordFilter,
    } = await this.globalConfigService.getConfigs([
      'openaiBaseUrl',
      'openaiBaseKey',
      'systemPreMessage',
      'openaiTemperature',
      'openaiBaseModel',
      'isGeneratePromptReference',
      'isConvertToBase64',
      'isSensitiveWordFilter',
    ]);

    /* 检测用户状态 */
    await this.userService.checkUserStatus(req.user);

    /* 敏感词检测 */
    res && res.setHeader('Content-type', 'application/octet-stream; charset=utf-8');
    // 检查敏感词汇
    if (isSensitiveWordFilter === '1') {
      const triggeredWords = await this.badWordsService.checkBadWords(prompt, req.user.id);
      if (triggeredWords.length > 0) {
        // 如果返回的数组不为空
        const tips = `您提交的信息中包含违规的内容，我们已对您的账户进行标记，请合规使用！`;
        throw new HttpException(tips, HttpStatus.BAD_REQUEST);
      }
    }

    /* 自动回复 */
    const autoReplyRes = await this.autoReplyService.checkAutoReply(prompt);
    Logger.debug(`自动回复检查结果: ${JSON.stringify(autoReplyRes)}`, 'ChatService');

    /* 设置对话变量 */
    let currentRequestModelKey = null;
    let appName = '';
    let setSystemMessage = '';
    res && res.status(200);
    const curIp = getClientIp(req);
    let useModelAvatar = '';
    let usingPlugin;

    if (usingPluginId) {
      Logger.debug(`使用插件ID: ${usingPluginId}`, 'ChatService');
      if (usingPluginId === 999) {
        usingPlugin = {
          parameters: 'mermaid',
        };
      }
    }

    /* 获取模型配置及预设设置 */
    if (appInfo) {
      const { isGPTs, gizmoID, name, isFixedModel, appModel, coverImg } = appInfo;
      useModelAvatar = coverImg;
      appName = name;
      if (isGPTs) {
        currentRequestModelKey = await this.modelsService.getCurrentModelKeyInfo('gpts');
        currentRequestModelKey.model = `gpt-4-gizmo-${gizmoID}`;
      } else if (!isGPTs && isFixedModel && appModel) {
        appInfo.preset && (setSystemMessage = appInfo.preset);
        currentRequestModelKey = await this.modelsService.getCurrentModelKeyInfo(appModel);
        currentRequestModelKey.model = appModel;
        Logger.debug(`使用固定模型和应用预设`, 'ChatService');
      } else {
        // 使用应用预设
        appInfo.preset && (setSystemMessage = appInfo.preset);
        currentRequestModelKey = await this.modelsService.getCurrentModelKeyInfo(model);
        Logger.debug(`使用应用预设模式`, 'ChatService');
      }
    } else {
      if (usingPlugin?.parameters === 'mermaid') {
        setSystemMessage = `
{
"title": "Mermaid专业图表大师",
"description": "智能多类型Mermaid图表生成专家",

## 角色定位
你是一位精通Mermaid语法的专业图表设计师，具备将复杂信息转化为清晰可视化图表的卓越能力。你不仅掌握所有Mermaid图表类型，还能根据用户需求智能选择最优图表方案。

## 核心能力矩阵

### 流程与逻辑类
- **流程图(flowchart)**: 展示流程、决策和系统工作流
- **时序图(sequenceDiagram)**: 描述对象间的交互顺序
- **状态图(stateDiagram)**: 展示状态转换和生命周期
- **用户旅程图(journey)**: 可视化用户体验历程

### 结构与关系类
- **类图(classDiagram)**: UML类结构和继承关系
- **实体关系图(erDiagram)**: 数据库实体关系建模
- **C4图(C4Context等)**: 软件架构多层次视图
- **思维导图(mindmap)**: 思维结构和概念关联

### 时间与进度类
- **甘特图(gantt)**: 项目进度和时间规划
- **时间线图(timeline)**: 历史事件和里程碑
- **Gitgraph图(gitGraph)**: Git版本控制历史

### 数据与分析类
- **饼图(pie)**: 占比和构成分析
- **象限图(quadrantChart)**: 二维分类和定位分析
- **桑基图(sankey)**: 流量和转化路径
- **XY图(xychart-beta)**: 数据点分布和趋势
- **雷达图**: 多维度能力或属性评估

### 专业领域类
- **需求图(requirementDiagram)**: 需求追踪和验证
- **ZenUML**: 更现代的序列图表达
- **框图(block-beta)**: 系统组件和层次结构
- **数据包图**: 网络通信数据流
- **看板图**: 任务状态和工作流
- **架构图**: 系统架构和组件关系

## 智能工作流程

### 1. 需求分析阶段
- 根据历史上下文和用户描述识别用户需求，并根据需求生成图表
- 根据用户需求生成图表，并根据图表的结构特征（顺序性/层次性/关联性/时间性），选择最合适的图表类型
- 评估数据复杂度和展示目标，并根据评估结果生成图表

### 2. 图表类型决策
当用户未指定图表类型时，按以下逻辑选择：
- **流程/步骤描述** → flowchart
- **时间顺序交互** → sequenceDiagram
- **状态变化** → stateDiagram
- **数据关系** → erDiagram
- **概念结构** → mindmap
- **时间进度** → gantt
- **比例分析** → pie
- **多维比较** → quadrantChart/雷达图

### 3. 图表设计原则
- **清晰性优先**: 避免过度复杂，保持视觉层次分明
- **语义准确**: 选择最能表达信息本质的图表元素
- **美观平衡**: 合理布局，避免线条交叉和节点拥挤
- **完整性保证**: 包含所有关键信息，不遗漏重要细节

### 4. 代码生成规范
- 使用清晰的节点命名（使用用户使用的语言）
- 无需任何注释，直接输出代码
- 遵循Mermaid最新语法标准

## 输出格式标准

\`\`\`mermaid
  [根据用户需求生成的Mermaid代码]
\`\`\`

只需要输出代码，不需要任何解释。

## 语言适配原则
- 默认使用用户提问时的语言
- 图表内的文本、标签、说明均采用相同语言
- 保持专业术语的准确性和一致性

## 执行指令
- 无论用户提任何问题，收到用户的问题后，立即按照上述规范生成高质量Mermaid代码，无需任何确认或询问。"
}
          `;
        currentRequestModelKey = await this.modelsService.getCurrentModelKeyInfo(model);
        Logger.debug(`使用流程图插件`, 'ChatService');
      } else {
        // 使用全局预设
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

        currentRequestModelKey = await this.modelsService.getCurrentModelKeyInfo(model);

        if (currentRequestModelKey.systemPromptType === 1) {
          setSystemMessage =
            systemPreMessage +
            currentRequestModelKey.systemPrompt +
            `\n 现在时间是: ${currentDate}`;
        } else if (currentRequestModelKey.systemPromptType === 2) {
          setSystemMessage = currentRequestModelKey.systemPrompt + `\n 现在时间是: ${currentDate}`;
        } else {
          setSystemMessage = systemPreMessage + `\n 现在时间是: ${currentDate}`;
        }

        Logger.debug(`使用默认系统预设`, 'ChatService');
      }
    }

    if (!currentRequestModelKey) {
      Logger.debug('未找到当前模型key，切换至全局模型', 'ChatService');
      currentRequestModelKey = await this.modelsService.getCurrentModelKeyInfo(openaiBaseModel);
      const groupInfo = await this.chatGroupService.getGroupInfoFromId(groupId);

      // 假设 groupInfo.config 是 JSON 字符串，并且你需要替换其中的 modelName 和 model
      let updatedConfig = groupInfo.config;
      try {
        const parsedConfig = JSON.parse(groupInfo.config);
        if (parsedConfig.modelInfo) {
          parsedConfig.modelInfo.modelName = currentRequestModelKey.modelName; // 替换为你需要的模型名称
          parsedConfig.modelInfo.model = currentRequestModelKey.model; // 替换为你需要的模型
          updatedConfig = JSON.stringify(parsedConfig);
        }
      } catch (error) {
        Logger.error('模型配置解析失败', error);
        throw new HttpException('配置解析错误！', HttpStatus.BAD_REQUEST);
      }

      await this.chatGroupService.update(
        {
          groupId,
          title: groupInfo.title,
          isSticky: false,
          config: updatedConfig,
          fileUrl: fileUrl,
        },
        req,
      );
    }

    const {
      deduct,
      isTokenBased,
      tokenFeeRatio,
      deductType,
      key,
      id: keyId,
      maxRounds,
      proxyUrl,
      maxModelTokens,
      max_tokens,
      timeout,
      model: useModel,
      isFileUpload,
      isImageUpload,
      keyType: modelType,
      deductDeepThink = 1,
      isMcpTool,
      deepThinkingType,
      drawingType,
    } = currentRequestModelKey;

    if (await this.chatLogService.checkModelLimits(req.user, useModel)) {
      res.write(
        `\n${JSON.stringify({
          status: 3,
          content: '1 小时内对话次数过多，请切换模型或稍后再试！',
          modelType: modelType,
        })}`,
      );
      res.end();
      return;
    }

    // 检测用户余额
    await this.userBalanceService.validateBalance(
      req,
      deductType,
      deduct * (usingDeepThinking ? deductDeepThink : 1),
    );

    // 整理对话参数
    const useModeName = modelName;
    const proxyResUrl = formatUrl(proxyUrl || openaiBaseUrl || 'https://api.openai.com');

    const modelKey = key || openaiBaseKey;
    const modelTimeout = (timeout || 300) * 1000;
    const temperature = Number(openaiTemperature) || 1;
    let promptReference = '';

    if (groupId) {
      const groupInfo = await this.chatGroupService.getGroupInfoFromId(groupId);
      this.updateChatTitle(groupId, groupInfo, modelType, prompt, req); // Call without await
      await this.chatGroupService.updateTime(groupId);
    }

    const userSaveLog = await this.chatLogService.saveChatLog({
      appId: appId,
      curIp,
      userId: req.user.id,
      type: modelType ? modelType : 1,
      fileUrl: fileUrl ? fileUrl : null,
      imageUrl: imageUrl ? imageUrl : null,
      content: prompt,
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
      model: useModel,
      modelName: '我',
      role: 'user',
      groupId: groupId ? groupId : null,
    });

    const assistantSaveLog = await this.chatLogService.saveChatLog({
      appId: appId ? appId : null,
      action: action ? action : null,
      curIp,
      userId: req.user.id,
      type: modelType ? modelType : 1,
      progress: '0%',
      model: useModel,
      modelName: useModeName,
      role: 'assistant',
      groupId: groupId ? groupId : null,
      status: 2,
      modelAvatar: usingPlugin?.pluginImg || useModelAvatar || modelAvatar || '',
      pluginParam: usingPlugin?.parameters
        ? usingPlugin.parameters
        : modelType === 2
        ? useModel
        : null,
    });
    const userLogId = userSaveLog.id;
    const assistantLogId = assistantSaveLog.id;

    if (autoReplyRes.answer && res) {
      if (autoReplyRes.isAIReplyEnabled === 0) {
        const chars = autoReplyRes.answer.split('');
        // 使用一个递归函数来逐个字符发送响应
        const sendCharByChar = index => {
          if (index < chars.length) {
            const msg = { text: chars[index] }; // 封装当前字符为对象
            res.write(`${JSON.stringify(msg)}\n`); // 发送当前字符
            setTimeout(() => sendCharByChar(index + 1), 10); // 设置定时器递归调用
          } else {
            res.end(); // 所有字符发送完毕，结束响应
          }
        };

        // 从第一个字符开始发送
        sendCharByChar(0);
        await this.chatLogService.updateChatLog(assistantLogId, {
          content: autoReplyRes.answer,
        });
        return;
      } else {
        setSystemMessage = setSystemMessage + autoReplyRes.answer;
      }
    }

    /* 获取历史消息 */
    const { messagesHistory } = await this.buildMessageFromParentMessageId(
      {
        groupId,
        systemMessage: setSystemMessage,
        maxModelTokens,
        maxRounds: maxRounds,
        isConvertToBase64: isConvertToBase64,
        fileUrl: fileUrl,
        imageUrl: imageUrl,
        model: useModel,
        isFileUpload,
        isImageUpload,
      },
      this.chatLogService,
    );

    /* 单独处理 MJ 积分的扣费 */
    let charge;
    if (action !== 'UPSCALE' && useModel === 'midjourney') {
      if (prompt.includes('--v 7')) {
        charge = deduct * 8;
      } else if (prompt.includes('--draft')) {
        charge = deduct * 2;
      } else {
        charge = deduct * 4;
      }
    } else {
      charge = deduct * (usingDeepThinking ? deductDeepThink : 1);
    }

    const abortController = new AbortController();
    /* 处理对话  */
    try {
      if (res) {
        res.on('close', () => {
          abortController.abort();
        });

        let response;
        try {
          let chatId = {
            chatId: assistantLogId,
          };

          res.write(`\n${JSON.stringify(chatId)}`);

          /* 普通对话 */
          response = await this.openAIChatService.chat(messagesHistory, {
            chatId: assistantLogId,
            extraParam,
            deepThinkingType,
            max_tokens: max_tokens,
            apiKey: modelKey,
            model: useModel,
            modelName: useModeName,
            temperature,
            isImageUpload,
            prompt,
            imageUrl,
            isFileUpload,
            fileUrl,
            usingNetwork,
            timeout: modelTimeout,
            proxyUrl: proxyResUrl,
            modelAvatar: modelAvatar,
            usingDeepThinking: usingDeepThinking,
            usingMcpTool: usingMcpTool,
            isMcpTool: isMcpTool,
            onProgress: chat => {
              res.write(`\n${JSON.stringify(chat)}`);
            },
            onFailure: async data => {
              await this.chatLogService.updateChatLog(assistantLogId, {
                content: data.errMsg,
                status: 4,
              });
            },
            onDatabase: async data => {
              // 保存数据到数据库
              if (data.networkSearchResult) {
                await this.chatLogService.updateChatLog(assistantLogId, {
                  networkSearchResult: data.networkSearchResult,
                });
              }
              if (data.fileVectorResult) {
                await this.chatLogService.updateChatLog(assistantLogId, {
                  fileVectorResult: data.fileVectorResult,
                });
              }
            },
            abortController,
          });

          Logger.debug(`JSON: ${JSON.stringify(response)}`, 'ChatService');

          if (response.errMsg) {
            Logger.error(
              `用户ID: ${req.user.id} 模型名称: ${useModeName} 模型: ${model} 回复出错，本次不扣除积分`,
              'ChatService',
            );
            return res.write(`\n${JSON.stringify(response)}`);
          }

          let totalText = '';
          messagesHistory.forEach(messagesHistory => {
            totalText += messagesHistory.content + ' ';
          });
          const promptTokens = await getTokenCount(totalText);
          const completionTokens = await getTokenCount(
            response.full_reasoning_content + response.full_content,
          );

          await this.chatLogService.updateChatLog(userLogId, {
            promptTokens: promptTokens,
            completionTokens: completionTokens,
            totalTokens: promptTokens + completionTokens,
          });

          let sanitizedAnswer = response.full_content;
          if (isSensitiveWordFilter === '1') {
            const triggeredWords = await this.badWordsService.checkBadWords(
              response.full_content,
              req.user.id,
            );

            if (triggeredWords.length > 0) {
              // 构造一个正则表达式来匹配所有敏感词
              const regex = new RegExp(triggeredWords.join('|'), 'gi'); // 忽略大小写替换

              // 使用回调函数替换敏感词，每个敏感词替换为相应长度的 *
              sanitizedAnswer = sanitizedAnswer.replace(regex, matched =>
                '*'.repeat(matched.length),
              );
              Logger.debug(`检测到敏感词，已进行屏蔽处理`, 'ChatService');
            }
          }

          // 如果检测到敏感词，替换为 ***
          // gpt回答 - 使用替换后的内容存入数据库
          await this.chatLogService.updateChatLog(assistantLogId, {
            // imageUrl: response?.imageUrl,
            content: sanitizedAnswer, // 使用替换后的内容
            reasoning_content: response.full_reasoning_content,
            tool_calls: response.tool_calls,
            promptTokens: promptTokens,
            completionTokens: completionTokens,
            totalTokens: promptTokens + completionTokens,
            status: 3,
          });

          try {
            if (isGeneratePromptReference === '1') {
              promptReference = await this.openAIChatService.chatFree(
                `根据用户提问{${prompt}}以及AI的回答{${response.full_content}}，生成三个更进入一步的问题来向AI提问，用{}包裹每个问题，不需要分行，不需要其他任何内容，单个提问不超过30个字`,
              );
              await this.chatLogService.updateChatLog(assistantLogId, {
                promptReference: promptReference,
              });
              Logger.debug(`生成了相关问题推荐`, 'ChatService');
            }
          } catch (error) {
            Logger.debug(`生成相关问题推荐失败: ${error}`);
          }

          if (isTokenBased === true) {
            charge =
              deduct *
              Math.ceil((promptTokens + completionTokens) / tokenFeeRatio) *
              (usingDeepThinking ? deductDeepThink : 1);
          }

          await this.userBalanceService.deductFromBalance(
            req.user.id,
            deductType,
            charge,
            promptTokens + completionTokens,
          );
          /* 记录key的使用次数 和使用token */
          await this.modelsService.saveUseLog(keyId, promptTokens + completionTokens);

          Logger.log(
            `对话完成 - 用户: ${req.user.id}, 模型: ${useModeName}(${model}), Token: ${
              promptTokens + completionTokens
            }, 积分: ${charge}`,
            'ChatService',
          );
          const userBalance = await this.userBalanceService.queryUserBalance(req.user.id);
          response.userBalance = userBalance;
          response.chatId = assistantLogId;
          response.promptReference = promptReference;
          return res.write(`\n${JSON.stringify(response)}`);
        } catch (error) {
          // 在这里处理错误，例如打印错误消息到控制台或向用户发送错误响应
          Logger.error('处理请求出错:', error);
          // 根据你的应用需求，你可能想要在这里设置response为一个错误消息或执行其他错误处理逻辑
          await this.chatLogService.updateChatLog(assistantLogId, {
            status: 5,
          });
          response = { error: '处理请求时发生错误' };
        }
      }
    } catch (error) {
      Logger.error('聊天处理全局错误', error);
      if (res) {
        return res.write('发生未知错误，请稍后再试');
      } else {
        throw new HttpException('发生未知错误，请稍后再试', HttpStatus.BAD_REQUEST);
      }
    } finally {
      res && res.end();
    }
  }

  async updateChatTitle(groupId, groupInfo, modelType, prompt, req) {
    if (groupInfo?.title === '新对话') {
      // '新对话' can be replaced with 'New chat' if needed
      let chatTitle: string;
      if (modelType === 1) {
        try {
          chatTitle = await this.openAIChatService.chatFree(
            `根据用户提问{${prompt}}，给这个对话取一个名字，不超过10个字，只需要返回标题，不需要其他任何内容。`,
          );
          if (chatTitle.length > 15) {
            chatTitle = chatTitle.slice(0, 15);
          }
          Logger.debug(`已生成对话标题: ${chatTitle}`);
        } catch (error) {
          Logger.debug(`标题生成失败，使用提问片段作为标题`);
          chatTitle = prompt.slice(0, 10);
        }
      } else {
        chatTitle = '创意 AI';
      }

      this.chatGroupService
        .update(
          {
            groupId,
            title: chatTitle,
          },
          req,
        )
        .then(() => Logger.debug(`更新对话标题: ${chatTitle}`))
        .catch(error => Logger.error(`更新对话标题失败`, error));
    }
  }

  async buildMessageFromParentMessageId(options: any, chatLogService) {
    const startTime = Date.now();

    let {
      systemMessage = '',
      maxRounds = 12,
      maxModelTokens = 64000,
      isFileUpload = 0,
      isImageUpload = 0,
      isConvertToBase64,
      groupId,
    } = options;

    // 确保 systemMessage 不超过 maxModelTokens
    // if (systemMessage.length > maxModelTokens) {
    //   Logger.debug(
    //     `系统消息过长(${systemMessage.length} > ${maxModelTokens})，进行截断处理`,
    //     'ChatService',
    //   );
    //   systemMessage = systemMessage.slice(0, maxModelTokens);
    // }

    const messages = [];
    // 查询历史对话列表
    if (groupId) {
      try {
        const history = await chatLogService.chatHistory(groupId, maxRounds);

        // 按时间顺序排序历史记录（如果需要）
        history.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

        // 整理成对的user-assistant消息
        let userMessages = [];
        let assistantMessages = [];

        // 先分类所有消息
        for (const record of history) {
          try {
            let content;

            // 单独处理图片和文件，允许同时存在

            // 初始化内容为原始内容或空字符串
            content = record.content || '';
            let hasSpecialFormat = false;

            // 1. 处理文件内容 - 逆向格式
            if (isFileUpload === 1 && record.fileUrl) {
              try {
                // 尝试解析JSON格式的fileUrl
                const filesInfo = JSON.parse(record.fileUrl);
                if (Array.isArray(filesInfo)) {
                  // 提取所有文件的URL并拼接
                  const fileUrls = filesInfo.map(file => file.url).join('\n');
                  content = fileUrls + '\n' + content;
                } else {
                  // 如果不是数组格式，按原来方式处理
                  content = record.fileUrl + '\n' + content;
                }
              } catch (error) {
                // 如果解析失败，说明可能是旧格式，直接拼接
                content = record.fileUrl + '\n' + content;
                Logger.debug(`解析fileUrl失败，使用原始格式: ${error.message}`, 'ChatService');
              }
            }

            // 2. 处理图片内容
            if (isImageUpload === 2 && record.imageUrl) {
              // GPT-Vision 格式处理 (特殊格式)
              hasSpecialFormat = true;
              const imageContent = await Promise.all(
                record.imageUrl.split(',').map(async url => ({
                  type: 'image_url',
                  image_url: {
                    url:
                      isConvertToBase64 === '1' ? await convertUrlToBase64(url.trim()) : url.trim(),
                  },
                })),
              );
              content = [{ type: 'text', text: content }, ...imageContent];
            }
            // 3. 逆向格式图片，直接添加到内容前面
            else if (isImageUpload === 1 && record.imageUrl) {
              content = record.imageUrl + '\n' + content;
            }

            // 处理assistant消息，移除think标签
            if (record.role === 'assistant') {
              content = removeThinkTags(content);

              // 跳过空的assistant消息
              if (typeof content === 'string' && !content.trim()) {
                continue;
              }

              assistantMessages.push({
                id: record.id,
                role: 'assistant',
                content: content,
                createdAt: record.createdAt,
              });
            } else if (record.role === 'user') {
              userMessages.push({
                id: record.id,
                role: 'user',
                content: content,
                createdAt: record.createdAt,
              });
            }
          } catch (error) {
            Logger.debug(`处理历史记录ID=${record.id}失败: ${error.message}`, 'ChatService');
          }
        }

        // 直接按照严格的system-user-assistant交替顺序构建消息
        // 确保消息按照正确的顺序：一条system（如果有）→ user→assistant→user→assistant...
        if (systemMessage) {
          messages.push({ role: 'system', content: systemMessage });
        }

        // 获取所有用户和助手消息，并按时间排序
        userMessages.sort(
          (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
        );
        assistantMessages.sort(
          (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
        );

        // 计算配对数量（取较小的数量）
        const pairCount = Math.min(userMessages.length, assistantMessages.length);

        // 按user-assistant对添加消息
        for (let i = 0; i < pairCount; i++) {
          messages.push({ role: 'user', content: userMessages[i].content });
          messages.push({ role: 'assistant', content: assistantMessages[i].content });
        }

        // 如果用户消息比助手消息多，添加最后一条用户消息
        if (userMessages.length > pairCount) {
          messages.push({ role: 'user', content: userMessages[userMessages.length - 1].content });
        }
      } catch (error) {
        Logger.error(`获取聊天历史记录失败: ${error.message}`, 'ChatService');
      }
    }

    // 计算并限制token数量
    let totalTokens = await getTokenCount(messages);

    // 动态计算token限制
    const tokenLimit = maxModelTokens < 8000 ? 4000 : maxModelTokens - 4000;

    // 如果超出token限制，进行裁剪
    if (totalTokens > tokenLimit) {
      Logger.debug(`消息超出token限制(${totalTokens} > ${tokenLimit})，开始裁剪`, 'ChatService');

      // 优化的裁剪算法
      let trimIteration = 0;
      while (totalTokens > tokenLimit && messages.length > 2) {
        trimIteration++;

        // 检查是否只剩下系统消息和当前用户消息
        if (
          messages.length === 2 &&
          ((messages[0].role === 'system' && messages[1].role === 'user') ||
            (messages[0].role === 'user' && messages[1].role === 'user'))
        ) {
          break;
        }

        // 保留系统消息和最后一条用户消息
        const systemIndex = messages.findIndex(m => m.role === 'system');
        const lastUserIndex = messages.length - 1; // 最后一条始终是当前用户消息

        // 从前往后删除非系统消息，直到剩下系统消息和最新用户消息
        // 优先删除较早的消息对
        if (messages.length > 2) {
          // 跳过系统消息
          const startIndex = systemIndex === 0 ? 1 : 0;

          // 删除最早的user-assistant对或单条消息
          if (startIndex < lastUserIndex) {
            if (
              messages[startIndex].role === 'user' &&
              startIndex + 1 < lastUserIndex &&
              messages[startIndex + 1].role === 'assistant'
            ) {
              // 删除一对消息
              messages.splice(startIndex, 2);
            } else {
              // 删除单条消息
              messages.splice(startIndex, 1);
            }
          }
        }

        // 重新计算token
        const newTotalTokens = await getTokenCount(messages);
        if (newTotalTokens >= totalTokens) {
          // 如果token没有减少，说明无法继续优化，强制退出
          Logger.debug('Token裁剪无效，停止裁剪过程');
          break;
        }

        // 更新token计数
        totalTokens = newTotalTokens;
      }
    }

    // 修正消息顺序问题：确保消息是一个user一个assistant交替出现
    // 遍历所有非系统消息，如果发现连续相同角色的消息，则进行调整
    if (messages.length > 1) {
      const fixedMessages = [];
      // 保留系统消息
      if (messages[0].role === 'system') {
        fixedMessages.push(messages[0]);
        messages.shift();
      }

      // 按照严格的user-assistant交替顺序重新构建消息
      // 确保最后一条消息是user
      const userMessages = messages
        .filter(msg => msg.role === 'user')
        .sort(
          (a, b) => new Date(a.createdAt || 0).getTime() - new Date(b.createdAt || 0).getTime(),
        );

      const assistantMessages = messages
        .filter(msg => msg.role === 'assistant')
        .sort(
          (a, b) => new Date(a.createdAt || 0).getTime() - new Date(b.createdAt || 0).getTime(),
        );

      // 保证最多使用较少的那一组消息的数量
      const pairCount = Math.min(userMessages.length, assistantMessages.length);

      // 构建交替的消息对
      for (let i = 0; i < pairCount; i++) {
        fixedMessages.push(userMessages[i]);
        fixedMessages.push(assistantMessages[i]);
      }

      // 如果还有剩余的user消息，添加最后一条
      if (userMessages.length > pairCount) {
        fixedMessages.push(userMessages[userMessages.length - 1]);
      }

      // 替换原消息数组
      messages.length = 0;
      messages.push(...fixedMessages);
    }

    Logger.debug(
      `构建消息历史完成: ${Math.floor(messages.length / 2)} 组对话, ${totalTokens} tokens, 耗时: ${
        Date.now() - startTime
      }ms`,
      'ChatService',
    );

    Logger.debug(`messages: ${JSON.stringify(messages)}`, 'ChatService');

    // throw new Error('test');
    return {
      messagesHistory: messages,
      round: messages.length,
    };
  }

  async ttsProcess(body: any, req: any, res?: any) {
    const { chatId, prompt } = body;

    const detailKeyInfo = await this.modelsService.getCurrentModelKeyInfo('tts-1');
    const { openaiBaseUrl, openaiBaseKey, openaiVoice } = await this.globalConfigService.getConfigs(
      ['openaiBaseUrl', 'openaiBaseKey', 'openaiVoice'],
    );

    // 从 detailKeyInfo 对象中解构赋值并设置默认值
    const { key, proxyUrl, deduct, deductType, timeout } = detailKeyInfo;
    const useKey = key || openaiBaseKey;
    const useTimeout = timeout * 1000;

    // 用户余额检测
    await this.userBalanceService.validateBalance(req, deductType, deduct);

    Logger.debug(
      `开始TTS处理: ${prompt.substring(0, 50)}${prompt.length > 50 ? '...' : ''}`,
      'TTSService',
    );

    try {
      // 使用OpenAI SDK进行TTS请求
      const formattedUrl = formatUrl(proxyUrl || openaiBaseUrl);
      const correctedProxyUrl = await correctApiBaseUrl(formattedUrl);
      const openai = new OpenAI({
        apiKey: useKey,
        baseURL: correctedProxyUrl,
        timeout: useTimeout,
      });

      // 获取音频数据
      const response = await openai.audio.speech.create({
        model: 'tts-1',
        input: prompt,
        voice: openaiVoice || 'onyx',
      });

      // 将响应转换为buffer
      const buffer = Buffer.from(await response.arrayBuffer());
      Logger.debug('TTS音频数据生成成功', 'TTSService');

      // 使用 Date 对象获取当前日期并格式化为 YYYYMM/DD
      const now = new Date();
      const year = now.getFullYear();
      const month = String(now.getMonth() + 1).padStart(2, '0'); // 月份从0开始，所以+1
      const day = String(now.getDate()).padStart(2, '0');
      const currentDate = `${year}${month}/${day}`;

      const ttsUrl = await this.uploadService.uploadFile(
        { buffer, mimetype: 'audio/mpeg' },
        `audio/openai/${currentDate}`,
      );

      // 更新聊天记录并扣除余额
      await Promise.all([
        this.chatLogService.updateChatLog(chatId, { ttsUrl }),
        this.userBalanceService.deductFromBalance(req.user.id, deductType, deduct),
      ]);

      res.status(200).send({ ttsUrl });
    } catch (error) {
      Logger.error('TTS处理失败', error, 'TTSService');
      res.status(500).send({ error: '语音合成请求处理失败' });
    }
  }
}
