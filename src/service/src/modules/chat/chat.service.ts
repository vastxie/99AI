import { formatUrl, getClientIp, getTokenCount } from '@/common/utils';
import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import axios, { AxiosRequestConfig } from 'axios';
import { Request, Response } from 'express';
import { In, Repository } from 'typeorm';
import { AiPptService } from '../ai/aiPPT';
import { CogVideoService } from '../ai/cogVideo.service';
import { FluxDrawService } from '../ai/fluxDraw.service';
import { LumaVideoService } from '../ai/lumaVideo.service';
import { MidjourneyService } from '../ai/midjourneyDraw.service';
import { OpenAIChatService } from '../ai/openaiChat.service';
import { OpenAIDrawService } from '../ai/openaiDraw.service';
import { StableDiffusionService } from '../ai/stableDiffusion.service';
import { SunoService } from '../ai/suno.service';
import { AppEntity } from '../app/app.entity';
import { AutoreplyService } from '../autoreply/autoreply.service';
import { BadWordsService } from '../badWords/badWords.service';
import { ChatGroupService } from '../chatGroup/chatGroup.service';
import { ChatLogService } from '../chatLog/chatLog.service';
import { ConfigEntity } from '../globalConfig/config.entity';
import { GlobalConfigService } from '../globalConfig/globalConfig.service';
import { ModelsService } from '../models/models.service';
import { PluginEntity } from '../plugin/plugin.entity';
import { UploadService } from '../upload/upload.service';
import { UserService } from '../user/user.service';
import { UserBalanceService } from '../userBalance/userBalance.service';
import { netSearchService } from '../ai/netSearch.service';

@Injectable()
export class ChatService {
  constructor(
    @InjectRepository(ConfigEntity)
    private readonly configEntity: Repository<ConfigEntity>,
    @InjectRepository(AppEntity)
    private readonly appEntity: Repository<AppEntity>,
    @InjectRepository(PluginEntity)
    private readonly pluginEntity: Repository<PluginEntity>,
    private readonly sunoService: SunoService,
    private readonly openAIChatService: OpenAIChatService,
    private readonly chatLogService: ChatLogService,
    private readonly midjourneyService: MidjourneyService,
    private readonly stableDiffusionService: StableDiffusionService,
    private readonly userBalanceService: UserBalanceService,
    private readonly userService: UserService,
    private readonly uploadService: UploadService,
    private readonly badWordsService: BadWordsService,
    private readonly autoreplyService: AutoreplyService,
    private readonly globalConfigService: GlobalConfigService,
    private readonly chatGroupService: ChatGroupService,
    private readonly modelsService: ModelsService,
    private readonly openAIDrawService: OpenAIDrawService,
    private readonly lumaVideoService: LumaVideoService,
    private readonly cogVideoService: CogVideoService,
    private readonly fluxDrawService: FluxDrawService,
    private readonly aiPptService: AiPptService,
    private readonly netSearchService: netSearchService
  ) {}

  /* 有res流回复 没有同步回复 */
  async chatProcess(body: any, req?: Request, res?: Response) {
    await this.userBalanceService.checkUserCertification(req.user.id);
    /* 获取对话参数 */
    const {
      options = {},
      usingPluginId,
      appId = null,
      specialModel,
      prompt,
      fileInfo,
      extraParam,
      model,
      drawId,
      customId,
      action,
      modelName,
      modelAvatar,
    } = body;

    // 获取应用信息
    let appInfo;
    if (specialModel) {
      appInfo = await this.appEntity.findOne({
        where: { des: specialModel, isSystemReserved: true },
      });
      // Logger.debug(`appId: ${JSON.stringify(appInfo, null, 2)}`);
    } else if (appId) {
      appInfo = await this.appEntity.findOne({
        where: { id: appId, status: In([1, 3, 4, 5]) },
      });
      // Logger.debug(`appId: ${JSON.stringify(appInfo, null, 2)}`);
      if (!appInfo) {
        throw new HttpException(
          '你当前使用的应用已被下架、请删除当前对话开启新的对话吧！',
          HttpStatus.BAD_REQUEST
        );
      }
    }

    const { groupId, fileParsing } = options;
    const {
      openaiTimeout,
      openaiBaseUrl,
      openaiBaseKey,
      systemPreMessage,
      isMjTranslate,
      mjTranslatePrompt,
      openaiTemperature,
      openaiBaseModel,
      isGeneratePromptReference,
      isConvertToBase64,
      isSensitiveWordFilter,
    } = await this.globalConfigService.getConfigs([
      'openaiTimeout',
      'openaiBaseUrl',
      'openaiBaseKey',
      'systemPreMessage',
      'isMjTranslate',
      'mjTranslatePrompt',
      'openaiTemperature',
      'openaiBaseModel',
      'isGeneratePromptReference',
      'isConvertToBase64',
      'isSensitiveWordFilter',
    ]);

    /* 检测用户状态 */
    await this.userService.checkUserStatus(req.user);

    /* 敏感词检测 */
    res &&
      res.setHeader('Content-type', 'application/octet-stream; charset=utf-8');
    // 检查敏感词汇
    if (isSensitiveWordFilter === '1') {
      const triggeredWords = await this.badWordsService.checkBadWords(
        prompt,
        req.user.id
      );
      if (triggeredWords.length > 0) {
        // 如果返回的数组不为空
        const tips = `您提交的信息中包含违规的内容，我们已对您的账户进行标记，请合规使用！`;
        throw new HttpException(tips, HttpStatus.BAD_REQUEST);
      }
    }

    /* 自动回复 */
    const autoReplyRes = await this.autoreplyService.checkAutoReply(prompt);
    // Logger.debug(
    //   `自动回复结果: ${JSON.stringify(autoReplyRes)}`,
    //   'ChatService'
    // );
    // return;

    /* 设置对话变量 */
    let currentRequestModelKey = null;
    let appName = '';
    let setSystemMessage = '';
    res && res.status(200);
    let response = null;
    const curIp = getClientIp(req);
    let usePrompt;
    let useModelAvatar = '';
    let usingPlugin;
    let searchResult;

    if (usingPluginId) {
      usingPlugin = await this.pluginEntity.findOne({
        where: { id: usingPluginId },
      });
      // Logger.debug(`插件信息: ${JSON.stringify(usingPlugin, null, 2)}`);
    }

    /* 获取模型配置及预设设置 */
    if (appInfo) {
      const { isGPTs, gizmoID, name, isFixedModel, appModel, coverImg } =
        appInfo;
      useModelAvatar = coverImg;
      appName = name;
      if (isGPTs) {
        currentRequestModelKey =
          await this.modelsService.getCurrentModelKeyInfo('gpts');
        // await this.chatLogService.checkModelLimits(req.user, 'gpts');
        currentRequestModelKey.model = `gpt-4-gizmo-${gizmoID}`;
      } else if (!isGPTs && isFixedModel && appModel) {
        // Logger.debug(appModel)
        appInfo.preset && (setSystemMessage = appInfo.preset);
        currentRequestModelKey =
          await this.modelsService.getCurrentModelKeyInfo(appModel);
        // await this.chatLogService.checkModelLimits(req.user, appModel);
        currentRequestModelKey.model = appModel;
        if (fileParsing) {
          setSystemMessage = `${setSystemMessage}以下是我提供给你的知识库：【${fileParsing}】，在回答问题之前，先检索知识库内有没有相关的内容，尽量使用知识库中获取到的信息来回答我的问题，以知识库中的为准。`;
        }

        Logger.log(
          `固定模型、使用应用预设: ${setSystemMessage}`,
          'ChatService'
        );
      } else {
        // 使用应用预设
        appInfo.preset && (setSystemMessage = appInfo.preset);
        currentRequestModelKey =
          await this.modelsService.getCurrentModelKeyInfo(model);
        // await this.chatLogService.checkModelLimits(req.user, model);
        if (fileParsing) {
          setSystemMessage = `${setSystemMessage}以下是我提供给你的知识库：【${fileParsing}】，在回答问题之前，先检索知识库内有没有相关的内容，尽量使用知识库中获取到的信息来回答我的问题，以知识库中的为准。`;
        }

        Logger.log(`使用应用预设: ${setSystemMessage}`, 'ChatService');
      }
    } else {
      const groupInfo = await this.chatGroupService.getGroupInfoFromId(groupId);
      if (usingPlugin?.parameters === 'net-search') {
        try {
          // 获取搜索结果
          searchResult = await this.netSearchService.webSearchPro(prompt);
        } catch (error) {
          Logger.error('网络请求失败', error);
          // 如果网络请求失败，可以设置一个默认值或备用数据
          searchResult = null;
        }

        const now = new Date();
        const options = {
          timeZone: 'Asia/Shanghai', // 设置时区为 'Asia/Shanghai'（北京时间）
          year: 'numeric' as 'numeric',
          month: '2-digit' as '2-digit',
          day: '2-digit' as '2-digit',
          hour: '2-digit' as '2-digit',
          minute: '2-digit' as '2-digit',
          hour12: false, // 使用24小时制
        };

        const currentDate = new Intl.DateTimeFormat('zh-CN', options).format(
          now
        );

        // 将 searchResult 转换为 JSON 字符串
        let searchPrompt = '';
        if (searchResult) {
          searchPrompt = JSON.stringify(searchResult, null, 2); // 格式化为漂亮的 JSON 字符串
        }

        // 设置系统消息
        setSystemMessage = `
          你的任务是根据用户的问题，通过下面的搜索结果提供更精确、详细、具体的回答。
          请在适当的情况下在对应部分句子末尾标注引用的链接，使用[[序号resultIndex](链接地址link)]格式，同时使用多个链接可连续使用比如[[2](链接地址)][[5](链接地址)]，
          在回答的最后，使用 序号resultIndex.[title](链接地址link) 标记出所有的来源。
          以下是搜索结果：
            ${searchPrompt}
            在回答时，请注意以下几点：
              - 现在时间是: ${currentDate}。
              - 并非搜索结果的所有内容都与用户的问题密切相关，你需要结合问题，对搜索结果进行甄别、筛选。
              - 对于列举类的问题（如列举所有航班信息），尽量将答案控制在10个要点以内，并告诉用户可以查看搜索来源、获得完整信息。优先提供信息完整、最相关的列举项；如非必要，不要主动告诉用户搜索结果未提供的内容。
              - 对于创作类的问题（如写论文），请务必在正文的段落中引用对应的参考编号。你需要解读并概括用户的题目要求，选择合适的格式，充分利用搜索结果并抽取重要信息，生成符合用户要求、极具思想深度、富有创造力与专业性的答案。你的创作篇幅需要尽可能延长，对于每一个要点的论述要推测用户的意图，给出尽可能多角度的回答要点，且务必信息量大、论述详尽。
              - 如果回答很长，请尽量结构化、分段落总结。如果需要分点作答，尽量控制在5个点以内，并合并相关的内容。
              - 对于客观类的问答，如果问题的答案非常简短，可以适当补充一到两句相关信息，以丰富内容。
              - 你需要根据用户要求和回答内容选择合适、美观的回答格式，确保可读性强。
              - 你的回答应该综合多个相关网页来回答，不能只重复引用一个网页。
              - 除非用户要求，否则你回答的语言需要和用户提问的语言保持一致。
            `;
        // 获取当前的模型信息
        currentRequestModelKey =
          await this.modelsService.getCurrentModelKeyInfo(model);
      } else if (usingPlugin?.parameters === 'mind-map') {
        setSystemMessage =
          'Please provide a detailed outline in Markdown format: Use a multi-level structure with at least 3-4 levels. Include specific solutions or steps under each topic. Make it suitable for creating mind maps. Provide only the outline content without any irrelevant explanations. Start directly with the outline, no introduction needed. Use the language I asked in. Note: Use #, ##, ### etc. for different heading levels. Use - or * for list items. Use bold, italic etc. to emphasize key points. Use tables, code blocks etc. as needed. Please provide a clear, content-rich Markdown format outline based on these requirements.';
        currentRequestModelKey =
          await this.modelsService.getCurrentModelKeyInfo(model);
        Logger.log(`使用插件预设: ${setSystemMessage}`, 'ChatService');
      } else if (fileParsing) {
        setSystemMessage = `以下是我提供给你的知识库：【${fileParsing}】，在回答问题之前，先检索知识库内有没有相关的内容，尽量使用知识库中获取到的信息来回答我的问题，以知识库中的为准。`;
        currentRequestModelKey =
          await this.modelsService.getCurrentModelKeyInfo(model);
        // await this.chatLogService.checkModelLimits(req.user, model);
        Logger.log(`使用文件解析: ${setSystemMessage}`, 'ChatService');
      } else {
        // 使用全局预设
        const currentDate = new Date().toISOString().split('T')[0];
        setSystemMessage = systemPreMessage + `\n Current date: ${currentDate}`;
        currentRequestModelKey =
          await this.modelsService.getCurrentModelKeyInfo(model);

        Logger.log(`使用全局预设: ${setSystemMessage}`, 'ChatService');
      }
    }

    if (!currentRequestModelKey) {
      Logger.debug('未找到当前模型key，切换至全局模型', 'ChatService');
      currentRequestModelKey = await this.modelsService.getCurrentModelKeyInfo(
        openaiBaseModel
      );
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
        Logger.debug('模型切换错误，请检查全局模型配置！', 'ChatService');
        throw new HttpException('配置解析错误！', HttpStatus.BAD_REQUEST);
      }

      await this.chatGroupService.update(
        {
          groupId,
          title: groupInfo.title,
          isSticky: false,
          config: updatedConfig,
          fileUrl: '',
        },
        req
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
      timeout,
      model: useModel,
      isFileUpload,
      keyType: modelType,
    } = currentRequestModelKey;

    if (await this.chatLogService.checkModelLimits(req.user, useModel)) {
      throw new HttpException(
        '1 小时内对话次数过多，请切换模型或稍后再试！',
        HttpStatus.TOO_MANY_REQUESTS
      );
    }

    if (
      isMjTranslate === '1' &&
      action === 'IMAGINE' &&
      model === 'midjourney'
    ) {
      // 将 prompt 按 "--" 分割成两部分
      const [beforeArgs, afterArgs] = prompt.split(/(?= --)/);

      // 使用正则表达式识别并提取链接
      const urlPattern = /(https?:\/\/[^\s]+)/g;
      const urls = beforeArgs.match(urlPattern) || [];

      // 提取链接后剩余的部分
      let textToTranslate = beforeArgs.replace(urlPattern, '').trim();

      // 调用翻译服务翻译中文部分
      const translatedText = await this.openAIChatService.chatFree(
        textToTranslate,
        mjTranslatePrompt ||
          "Translate any given phrase from any language into English. For instance, when I input '{可爱的熊猫}', you should output '{cute panda}', with no period at the end."
      );

      // 重新拼接链接、翻译后的文本和附加参数
      const finalTranslatedPrompt = [...urls, translatedText].join(' ').trim();
      usePrompt = afterArgs
        ? `${finalTranslatedPrompt}${afterArgs}`
        : finalTranslatedPrompt;

      // 如果是文件上传，保留 fileInfo 逻辑
      if (isFileUpload === '1' && fileInfo) {
        usePrompt = `${fileInfo} ${usePrompt}`;
      }

      // Logger.debug(`翻译后的用户提问: ${translatedText}, 最终使用的提示: ${usePrompt}`);
    } else {
      usePrompt =
        isFileUpload === '1' && fileInfo ? fileInfo + ' ' + prompt : prompt;
      // Logger.debug(`未进行翻译，最终使用的提示: ${usePrompt}`);
    }

    // 检测用户余额
    await this.userBalanceService.validateBalance(req, deductType, deduct);

    // 整理对话参数
    const useModeName = modelName;
    const proxyResUrl = formatUrl(
      proxyUrl || openaiBaseUrl || 'https://api.openai.com'
    );

    const modelKey = key || openaiBaseKey;
    const modelTimeout = (timeout || openaiTimeout || 300) * 1000;
    const temperature = Number(openaiTemperature) || 1;
    // Logger.log(
    //   `\n` +
    //     `超时设置: ${modelTimeout / 1000} s\n` +
    //     `请求地址: ${proxyResUrl}\n` +
    //     `使用的模型名称: ${useModeName}\n` +
    //     `使用的模型: ${useModel}`,
    //   'ChatService'
    // );

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
      prompt,
      fileInfo: fileInfo ? fileInfo : null,
      answer: '',
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
      prompt: prompt,
      fileInfo: null,
      answer: '',
      progress: '0%',
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
      model: useModel,
      modelName: useModeName,
      role: 'assistant',
      groupId: groupId ? groupId : null,
      status: 2,
      modelAvatar:
        usingPlugin?.pluginImg || useModelAvatar || modelAvatar || '',
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
        const sendCharByChar = (index) => {
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
          answer: autoReplyRes.answer,
        });
        return;
      } else {
        setSystemMessage = setSystemMessage + autoReplyRes.answer;
      }
    }

    // Logger.debug(`当前使用的模型key: ${setSystemMessage}`);
    /* 获取历史消息 */
    const { messagesHistory } = await this.buildMessageFromParentMessageId(
      prompt,
      {
        groupId,
        systemMessage: setSystemMessage,
        maxModelTokens,
        maxRounds: maxRounds,
        // usingPlugin?.parameters === 'net-search' ||
        // usingPlugin?.parameters === 'mind-map' ||
        // useModel.includes('suno')
        //   ? 0
        //   : maxRounds,
        isConvertToBase64: isConvertToBase64,
        fileInfo: fileInfo,
        model: useModel,
        isFileUpload,
      },
      this.chatLogService
    );

    /* 单独处理 MJ 积分的扣费 */
    let charge =
      action !== 'UPSCALE' && useModel === 'midjourney' ? deduct * 4 : deduct;

    const abortController = new AbortController();
    /* 处理对话  */
    try {
      if (res) {
        res.on('close', () => {
          abortController.abort();
        });

        let response;
        // const { key, maxToken, maxTokenRes, proxyResUrl } = await this.formatModelToken(currentRequestModelKey);
        let firstChunk = true;
        try {
          /* 绘画 */
          if (
            (useModel === 'dall-e-3' ||
              useModel === 'midjourney' ||
              useModel === 'ai-ppt' ||
              useModel === 'suno-music' ||
              useModel === 'luma-video' ||
              useModel.includes('stable-diffusion') ||
              useModel.includes('cog-video') ||
              useModel.includes('flux')) &&
            modelType === 2
          ) {
            if (useModel === 'dall-e-3') {
              response = this.openAIDrawService.dalleDraw(
                {
                  prompt: prompt,
                  extraParam: extraParam,
                  apiKey: modelKey,
                  proxyUrl: proxyResUrl,
                  model: useModel,
                  timeout: modelTimeout,
                  modelName: useModeName,
                  groupId: groupId,
                  onSuccess: async (data) => {
                    // 处理成功获取绘图结果的逻辑
                    await this.chatLogService.updateChatLog(assistantLogId, {
                      fileInfo: data?.fileInfo,
                      answer: data?.answer || prompt,
                      progress: '100%',
                      status: data.status,
                    });
                  },
                  onFailure: async (data) => {
                    // 处理失败逻辑
                    await this.chatLogService.updateChatLog(assistantLogId, {
                      answer: '绘图失败',
                      status: data.status,
                    });
                  },
                },
                this.buildMessageFromParentMessageId
              );
              await this.chatLogService.updateChatLog(assistantLogId, {
                answer: '绘制中',
              });
            } else if (useModel === 'ai-ppt') {
              Logger.log('开始生成PPT', 'DrawService');
              response = this.aiPptService.aiPPT({
                usePrompt: usePrompt,
                prompt: prompt,
                apiKey: modelKey,
                proxyUrl: proxyResUrl,
                model: useModel,
                modelName: useModeName,
                drawId,
                customId,
                action,
                timeout: modelTimeout,
                assistantLogId,
                extraParam,
                fileInfo,
              });
              await this.chatLogService.updateChatLog(assistantLogId, {
                answer: '生成中',
              });
            } else if (useModel.includes('flux')) {
              response = this.fluxDrawService.fluxDraw(
                {
                  prompt: prompt,
                  extraParam: extraParam,
                  apiKey: modelKey,
                  proxyUrl: proxyResUrl,
                  model: useModel,
                  timeout: modelTimeout,
                  modelName: useModeName,
                  groupId: groupId,
                  onSuccess: async (data) => {
                    // 处理成功获取绘图结果的逻辑
                    await this.chatLogService.updateChatLog(assistantLogId, {
                      fileInfo: data?.fileInfo,
                      answer: data?.answer || prompt,
                      progress: '100%',
                      status: data.status,
                    });
                  },
                  onFailure: async (data) => {
                    // 处理失败逻辑
                    await this.chatLogService.updateChatLog(assistantLogId, {
                      answer: '绘图失败',
                      status: data.status,
                    });
                  },
                },
                this.buildMessageFromParentMessageId
              );
              await this.chatLogService.updateChatLog(assistantLogId, {
                answer: '绘制中',
              });
            } else if (useModel.includes('suno-music')) {
              response = this.sunoService.suno({
                assistantLogId,
                apiKey: modelKey,
                action,
                prompt,
                timeout: modelTimeout,
                proxyUrl: proxyResUrl,
                taskData: customId,
              });
              await this.chatLogService.updateChatLog(assistantLogId, {
                answer: '提交成功，歌曲生成中',
              });
            } else if (useModel.includes('luma-video')) {
              // Logger.debug('luma-video');
              response = this.lumaVideoService.lumaVideo({
                fileInfo,
                extraParam,
                assistantLogId,
                apiKey: modelKey,
                action,
                prompt,
                model: useModel,
                timeout: modelTimeout,
                proxyUrl: proxyResUrl,
                taskData: customId,
                onGenerate: async (data) => {
                  // 处理成功获取绘图结果的逻辑
                  await this.chatLogService.updateChatLog(assistantLogId, {
                    fileInfo: data?.fileInfo,
                    answer: data?.answer || prompt,
                    // progress: '100%',
                    status: 2,
                  });
                },
                onSuccess: async (data) => {
                  // 处理成功获取绘图结果的逻辑
                  await this.chatLogService.updateChatLog(assistantLogId, {
                    fileInfo: data?.fileInfo,
                    answer: data?.answer || prompt,
                    progress: '100%',
                    status: 3,
                  });
                },
                onFailure: async (data) => {
                  // 处理失败逻辑
                  await this.chatLogService.updateChatLog(assistantLogId, {
                    answer: data.errMsg,
                    status: 4,
                  });
                },
              });
              await this.chatLogService.updateChatLog(assistantLogId, {
                answer: '提交成功，视频生成中',
              });
            } else if (useModel.includes('cog-video')) {
              // Logger.debug('luma-video');
              response = this.cogVideoService.cogVideo({
                fileInfo,
                extraParam,
                assistantLogId,
                apiKey: modelKey,
                action,
                prompt,
                model: useModel,
                timeout: modelTimeout,
                proxyUrl: proxyResUrl,
                taskData: customId,
                onGenerate: async (data) => {
                  // 处理成功获取绘图结果的逻辑
                  await this.chatLogService.updateChatLog(assistantLogId, {
                    fileInfo: data?.fileInfo,
                    answer: data?.answer || prompt,
                    // progress: '100%',
                    status: 2,
                  });
                },
                onSuccess: async (data) => {
                  // 处理成功获取绘图结果的逻辑
                  await this.chatLogService.updateChatLog(assistantLogId, {
                    fileInfo: data?.fileInfo,
                    answer: data?.answer || prompt,
                    progress: '100%',
                    status: 3,
                  });
                },
                onFailure: async (data) => {
                  // 处理失败逻辑
                  await this.chatLogService.updateChatLog(assistantLogId, {
                    answer: data.errMsg,
                    status: 4,
                  });
                },
              });
              await this.chatLogService.updateChatLog(assistantLogId, {
                answer: '提交成功，视频生成中',
              });
            } else if (useModel.includes('stable-diffusion')) {
              response = this.stableDiffusionService.sdxl({
                chatId: assistantLogId,
                maxModelTokens,
                apiKey: modelKey,
                model: useModel,
                modelName: useModeName,
                modelType,
                prompt,
                fileInfo,
                isFileUpload,
                timeout: modelTimeout,
                proxyUrl: proxyResUrl,
                onSuccess: async (data) => {
                  // 处理成功获取绘图结果的逻辑
                  await this.chatLogService.updateChatLog(assistantLogId, {
                    fileInfo: data?.fileInfo,
                    answer: data?.answer || prompt,
                    progress: '100%',
                    status: 3,
                  });
                },
                onFailure: async (data) => {
                  // 处理失败逻辑
                  await this.chatLogService.updateChatLog(assistantLogId, {
                    answer: '生成失败',
                    status: 4,
                  });
                },
              });
              await this.chatLogService.updateChatLog(assistantLogId, {
                answer: '绘制中',
              });
            } else {
              response = await this.midjourneyService.midjourneyDraw({
                usePrompt: usePrompt,
                prompt: prompt,
                apiKey: modelKey,
                proxyUrl: proxyResUrl,
                model: useModel,
                modelName: useModeName,
                drawId,
                customId,
                action,
                fileInfo,
                timeout: modelTimeout,
                assistantLogId,
              });
              await this.chatLogService.updateChatLog(assistantLogId, {
                answer: response.answer,
                status: response.status,
              });
            }

            //执行扣费
            if (response.status !== 5) {
              await this.modelsService.saveUseLog(keyId, 1);
              await this.userBalanceService.deductFromBalance(
                req.user.id,
                deductType,
                charge
              );
            } else {
              Logger.log('任务提交失败，不执行扣费', 'ChatService');
            }

            //查询用户现在的余额
            const userBalance = await this.userBalanceService.queryUserBalance(
              req.user.id
            );
            response.userBalance = { ...userBalance };
            response.text = response.answer;
            response.status = response.status || 2;
            response.model = model;
            response.modelName = modelName;

            return res.write(`\n${JSON.stringify(response)}`);

            /* 记录key的使用次数 和使用token */
          } else {
            /* 普通对话 */
            response = await this.openAIChatService.openAIChat(
              messagesHistory,
              {
                chatId: assistantLogId,
                maxModelTokens,
                apiKey: modelKey,
                model: useModel,
                modelName: useModeName,
                temperature,
                modelType,
                prompt,
                fileInfo,
                isFileUpload,
                timeout: modelTimeout,
                proxyUrl: proxyResUrl,
                modelAvatar: modelAvatar,
                onProgress: (chat) => {
                  res.write(
                    firstChunk
                      ? JSON.stringify(chat)
                      : `\n${JSON.stringify(chat)}`
                  );
                  firstChunk = false;
                },
                onFailure: async (data) => {
                  await this.chatLogService.updateChatLog(assistantLogId, {
                    answer: data.errMsg,
                    status: 4,
                  });
                },
                abortController,
              }
            );

            if (response.errMsg) {
              Logger.error(
                `用户ID: ${req.user.id} 模型名称: ${useModeName} 模型: ${model} 回复出错，本次不扣除积分`,
                'ChatService'
              );
              return res.write(`\n${JSON.stringify(response)}`);
            }

            let totalText = '';
            messagesHistory.forEach((messagesHistory) => {
              totalText += messagesHistory.content + ' ';
            });
            const promptTokens = await getTokenCount(totalText);
            const completionTokens = await getTokenCount(response.answer);
            await this.chatLogService.updateChatLog(userLogId, {
              promptTokens: promptTokens,
              completionTokens: completionTokens,
              totalTokens: promptTokens + completionTokens,
            });

            let sanitizedAnswer = response.answer;
            if (isSensitiveWordFilter === '1') {
              const triggeredWords = await this.badWordsService.checkBadWords(
                response.answer,
                req.user.id
              );

              if (triggeredWords.length > 0) {
                // 构造一个正则表达式来匹配所有敏感词
                const regex = new RegExp(triggeredWords.join('|'), 'gi'); // 忽略大小写替换

                // 使用回调函数替换敏感词，每个敏感词替换为相应长度的 *
                sanitizedAnswer = sanitizedAnswer.replace(regex, (matched) =>
                  '*'.repeat(matched.length)
                );
              }
            }

            // 如果检测到敏感词，替换为 ***
            // gpt回答 - 使用替换后的内容存入数据库
            await this.chatLogService.updateChatLog(assistantLogId, {
              fileInfo: response?.fileInfo,
              answer: sanitizedAnswer, // 使用替换后的内容
              promptTokens: promptTokens,
              completionTokens: completionTokens,
              totalTokens: promptTokens + completionTokens,
              status: 3,
            });

            try {
              if (isGeneratePromptReference === '1') {
                const promptReference = await this.openAIChatService.chatFree(
                  `根据用户提问{${prompt}}以及 AI 的回答{${response.answer}}，生成三个更进入一步的提问，用{}包裹每个问题，不需要分行，不需要其他任何内容，单个提问不超过30个字`
                );
                await this.chatLogService.updateChatLog(assistantLogId, {
                  promptReference: promptReference,
                });
              }
            } catch (error) {
              Logger.error(`调用 chatFree 出错: ${error}`);
            }

            if (isTokenBased === true) {
              charge =
                deduct *
                Math.ceil((promptTokens + completionTokens) / tokenFeeRatio);
            }

            await this.userBalanceService.deductFromBalance(
              req.user.id,
              deductType,
              charge,
              promptTokens + completionTokens
            );
            /* 记录key的使用次数 和使用token */
            await this.modelsService.saveUseLog(
              keyId,
              promptTokens + completionTokens
            );

            Logger.log(
              `用户ID: ${
                req.user.id
              } 模型名称: ${useModeName} 模型: ${model} 消耗token: ${
                promptTokens + completionTokens
              }, 消耗积分： ${charge}`,
              'ChatService'
            );
            const userBalance = await this.userBalanceService.queryUserBalance(
              req.user.id
            );
            response.userBalance = { ...userBalance };
            return res.write(`\n${JSON.stringify(response)}`);
          }
        } catch (error) {
          // 在这里处理错误，例如打印错误消息到控制台或向用户发送错误响应
          Logger.error('发生错误:', error);
          // 根据你的应用需求，你可能想要在这里设置response为一个错误消息或执行其他错误处理逻辑
          await this.chatLogService.updateChatLog(assistantLogId, {
            status: 5,
          });
          response = { error: '处理请求时发生错误' };
        }
      } else {
        response = await this.openAIChatService.openAIChat(messagesHistory, {
          chatId: assistantLogId,
          maxModelTokens,
          apiKey: modelKey,
          model: useModel,
          modelName: useModeName,
          modelType,
          temperature,
          prompt,
          fileInfo,
          isFileUpload,
          timeout: modelTimeout,
          proxyUrl: proxyResUrl,
          abortController,
        });
        await this.userBalanceService.deductFromBalance(
          req.user.id,
          deductType,
          charge
        );
        return response.answer;
      }
    } catch (error) {
      Logger.error(
        'chat-error <----------------------------------------->',
        modelKey,
        error
      );
      if (res) {
        return res.write('发生未知错误，请稍后再试');
      } else {
        throw new HttpException(
          '发生未知错误，请稍后再试',
          HttpStatus.BAD_REQUEST
        );
      }
    } finally {
      res && res.end();
    }
  }

  async usePlugin(prompt: string, pluginParam: string) {
    const { pluginUrl, pluginKey } = await this.globalConfigService.getConfigs([
      'pluginUrl',
      'pluginKey',
    ]);
    const key = pluginKey;
    const proxyUrl = pluginUrl;

    const options: AxiosRequestConfig = {
      method: 'POST',
      url: `${proxyUrl}/plugins/${pluginParam}`,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${key}`,
      },
      data: {
        prompt: prompt,
      },
    };

    try {
      const response: any = await axios(options);
      Logger.log(
        `插件调用成功 返回结果: ${JSON.stringify(response.data, null, 2)}`,
        'PluginService'
      );
      return response.data.text;
    } catch (error) {
      Logger.error('error: ', error);
    }
  }

  async updateChatTitle(groupId, groupInfo, modelType, prompt, req) {
    if (groupInfo?.title === '新对话') {
      // '新对话' can be replaced with 'New chat' if needed
      let chatTitle: string;
      if (modelType === 1) {
        try {
          chatTitle = await this.openAIChatService.chatFree(
            `根据用户提问{${prompt}}，给这个对话取一个名字，不超过10个字`
          );
          if (chatTitle.length > 15) {
            chatTitle = chatTitle.slice(0, 15);
          }
        } catch (error) {
          Logger.error(`调用 chatFree 出错: ${error}`);
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
            isSticky: false,
            config: '',
            fileUrl: '',
          },
          req
        )
        .then(() => Logger.log(`更新标题名称为: ${chatTitle}`, 'ChatService'))
        .catch((error) => Logger.error(`更新对话组标题失败: ${error}`));
    }
  }

  async buildMessageFromParentMessageId(
    text: string,
    options: any,
    chatLogService
  ) {
    let {
      systemMessage = '',
      fileInfo,
      groupId,
      maxRounds = 5,
      maxModelTokens = 8000,
      isFileUpload = 0,
      isConvertToBase64, // 新增选项，是否转换为Base64
    } = options;

    // 确保 systemMessage 不超过 maxModelTokens
    if (systemMessage.length > maxModelTokens) {
      Logger.log('系统消息超过最大长度，将被截断', 'ChatService');
      systemMessage = systemMessage.slice(0, maxModelTokens);
    }

    let messages = [];
    // 添加系统消息（如果有）
    if (systemMessage) {
      messages.push({ role: 'system', content: systemMessage });
    }

    // 查询历史对话列表
    if (groupId) {
      const history = await chatLogService.chatHistory(groupId, maxRounds);
      let tempUserMessage = null; // 用于暂存user消息，确保和assistant消息成对出现

      // 使用 for...of 结合 async/await，确保等待每个异步操作完成
      for (const record of history) {
        try {
          let content;

          if (
            (isFileUpload === 2 || isFileUpload === 3) &&
            record.fileInfo &&
            record.role === 'user'
          ) {
            // 特殊处理gpt-4-vision-preview模型
            const imageUrls = await Promise.all(
              record.fileInfo.split(',').map(async (url) => ({
                type: 'image_url',
                image_url: {
                  url:
                    isConvertToBase64 === '1'
                      ? await this.convertUrlToBase64(url.trim())
                      : url.trim(),
                },
              }))
            );
            content = [{ type: 'text', text: record.text }, ...imageUrls];
          } else if (
            isFileUpload === 1 &&
            record.fileInfo &&
            record.role === 'user'
          ) {
            // 特殊处理gpt-4-all模型
            // const urls = await Promise.all(
            //   record.fileInfo.split(',').map(async (url) => url.trim())
            // );
            // content = urls.join('\n') + '\n' + record.text;

            content = record.fileInfo + '\n' + record.text;
          } else {
            // 默认处理
            content = record.text;
          }

          // 确保user和assistant消息成对且不为空
          if (record.role === 'user') {
            tempUserMessage = { role: record.role, content }; // 暂存user消息
          } else if (record.role === 'assistant') {
            // 确保 content 是字符串
            const contentStr = Array.isArray(content)
              ? JSON.stringify(content)
              : content;
            if (tempUserMessage && contentStr.trim() !== '') {
              messages.push(tempUserMessage); // 添加之前暂存的user消息
              messages.push({ role: record.role, content }); // 添加assistant消息
              tempUserMessage = null; // 重置暂存的user消息
            }
          }
        } catch (error) {
          Logger.error(
            '处理历史记录时出错:',
            error,
            '记录:',
            JSON.stringify(record, null, 2)
          );
        }
      }
    }

    // 添加当前用户消息
    let currentMessageContent;
    if ((isFileUpload === 2 || isFileUpload === 3) && fileInfo) {
      // 处理 fileInfo 为单个文件或多个文件的情况
      const imageUrls = await Promise.all(
        fileInfo.split(',').map(async (url) => ({
          type: 'image_url',
          image_url: {
            url:
              isConvertToBase64 === '1'
                ? await this.convertUrlToBase64(url.trim())
                : url.trim(),
          },
        }))
      );
      currentMessageContent = [{ type: 'text', text }, ...imageUrls];
    } else if (isFileUpload === 1 && fileInfo) {
      // const urls = await Promise.all(
      //   fileInfo.split(',').map(async (url) => url.trim())
      // );
      // currentMessageContent = urls.join('\n') + '\n' + text;
      currentMessageContent = fileInfo + '\n' + text;
    } else {
      currentMessageContent = text;
    }
    messages.push({ role: 'user', content: currentMessageContent });

    let totalTokens = await getTokenCount(messages);

    // 限制消息
    let tokenLimit: number;
    if (maxModelTokens < 8000) {
      tokenLimit = 4000;
    } else {
      tokenLimit = maxModelTokens - 4000;
    }

    while (totalTokens > tokenLimit) {
      // 检查是否只剩下一条system消息和一条user消息
      if (
        messages.length === 2 &&
        messages[0].role === 'system' &&
        messages[1].role === 'user'
      ) {
        // 如果是，那么不再尝试删除消息，直接跳出循环
        break;
      }

      let foundPairToDelete = false;
      for (let i = 0; i < messages.length; i++) {
        if (
          messages[i].role !== 'system' &&
          messages[i + 1] &&
          messages[i + 1].role === 'assistant'
        ) {
          // 从前往后逐对删除非系统消息，确保成对删除
          messages.splice(i, 2);
          foundPairToDelete = true;
          break;
        }
      }

      // 如果没有找到可以删除的成对消息，则尝试删除单个user消息（如果存在）
      if (!foundPairToDelete) {
        for (let i = 0; i < messages.length; i++) {
          if (messages[i].role === 'user') {
            messages.splice(i, 1);
            break;
          }
        }
      }

      totalTokens = await getTokenCount(messages); // 重新计算总token数
      // 再次检查是否只剩下一条system消息和一条user消息
      if (messages.length <= 2) {
        break; // 如果是，提前跳出循环
      }
    }
    return {
      messagesHistory: messages,
      round: messages.length,
    };
  }

  // 新增：转换URL到Base64的辅助函数
  async convertUrlToBase64(url: string): Promise<string> {
    try {
      console.log(`正在尝试转换URL为Base64: ${url}`);

      const response = await axios.get(url, { responseType: 'arraybuffer' });
      const buffer = Buffer.from(response.data, 'binary'); // 获取图片的二进制数据

      console.log(`成功获取图片，正在转换为Base64: ${url}`);

      const base64Data = `data:${
        response.headers['content-type']
      };base64,${buffer.toString('base64')}`;
      console.log(`成功转换URL为Base64: ${url}`);
      return base64Data;
    } catch (error) {
      console.error('转换URL为Base64时发生错误:', error);
      console.warn(`返回原始链接: ${url}`);
      return url; // 返回原始URL作为回退
    }
  }

  async ttsProcess(body: any, req: any, res?: any) {
    const { chatId, prompt } = body;

    const detailKeyInfo = await this.modelsService.getCurrentModelKeyInfo(
      'tts-1'
    );
    const { openaiTimeout, openaiBaseUrl, openaiBaseKey, openaiVoice } =
      await this.globalConfigService.getConfigs([
        'openaiTimeout',
        'openaiBaseUrl',
        'openaiBaseKey',
        'openaiVoice',
      ]);

    // 从 detailKeyInfo 对象中解构赋值并设置默认值
    const { key, proxyUrl, deduct, deductType, timeout } = detailKeyInfo;
    const useKey = key || openaiBaseKey;
    const useUrl = formatUrl(proxyUrl || openaiBaseUrl);
    const useTimeout = (timeout || openaiTimeout) * 1000;

    // 用户余额检测
    await this.userBalanceService.validateBalance(req, deductType, deduct);

    Logger.log('开始 TTS 请求:', prompt, 'TTSService');

    const options: AxiosRequestConfig = {
      method: 'POST',
      url: `${useUrl}/v1/audio/speech`,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${useKey}`,
      },
      responseType: 'arraybuffer',
      timeout: useTimeout,
      data: {
        model: 'tts-1',
        input: prompt,
        voice: openaiVoice || 'onyx',
      },
    };

    try {
      const response = await axios(options);
      Logger.log('TTS 请求获取成功', 'TTSService');

      const buffer = Buffer.from(response.data);
      // const filename = `${uuid.v4().slice(0, 10)}.mp3`;
      const now = new Date();
      const year = now.getFullYear();
      const month = String(now.getMonth() + 1).padStart(2, '0'); // 月份从0开始，所以+1
      const day = String(now.getDate()).padStart(2, '0');
      const currentDate = `${year}${month}/${day}`;

      const ttsUrl = await this.uploadService.uploadFile(
        { buffer, mimetype: 'audio/mpeg' },
        `audio/openai/${currentDate}`
      );

      // 更新聊天记录并扣除余额
      await Promise.all([
        this.chatLogService.updateChatLog(chatId, { ttsUrl }),
        this.userBalanceService.deductFromBalance(
          req.user.id,
          deductType,
          deduct
        ),
      ]);

      res.status(200).send({ ttsUrl });
    } catch (error) {
      Logger.error('TTS 请求或上传过程失败:', error, 'TTSService');
      res.status(500).send({ error: 'Failed to process TTS request' });
    }
  }
}
