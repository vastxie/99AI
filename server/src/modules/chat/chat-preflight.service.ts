import { HttpException, HttpStatus, Inject, Injectable, Optional } from '@nestjs/common';
import { createHash } from 'crypto';
import { plainToInstance } from 'class-transformer';
import { ValidationError, validateSync } from 'class-validator';
import { RedisClientType } from 'redis';
import { CONTENT_FILTER_PORT, ContentFilterPort } from '../contentFilter/content-filter.port';
import { BILLING_PORT, BillingPort } from '../billing/billing.port';
import { ChatGroupService } from '../chatGroup/chatGroup.service';
import { ChatLogService } from '../chatLog/chatLog.service';
import { GlobalConfigService } from '../globalConfig/globalConfig.service';
import { ModelsService } from '../models/models.service';
import {
  ModelGatewayReasoningEffort,
  multimodalTypesFromCapabilities,
  resolveModelGatewayReasoningEffort,
} from '../modelGateway/model-gateway.types';
import { UserService } from '../user/user.service';
import {
  ChatSubmissionFingerprint,
  ChatSubmissionOperation,
  ChatSubmissionService,
} from './chat-submission.service';
import { ChatProcessDto } from './dto/chatProcess.dto';
import { StreamEmitter } from './emitters/stream-emitter.interface';
import { buildRuntimeContextBlock } from './prompt-context.util';

export interface ChatAdmissionResult {
  body: ChatProcessDto;
  user: any;
  visitorId: string | null;
  chatUserId: number | null;
  workflowOwnerId: string | number | null;
  prompt: string;
  parentTurnId?: string;
  sourceSocketId?: string;
  chatChannel: string;
  operation: ChatSubmissionOperation;
  strategy?: string;
  submissionId: string | null;
  submissionFingerprint: ChatSubmissionFingerprint | null;
  chatGroupId: number;
  conversationGid: string;
}

/** 可变预检通过后交给执行层的全部请求上下文。 */
export interface ChatPreflightResult extends ChatAdmissionResult {
  setSystemMessage: string;
  userRuntimeContext: string;
  currentRequestModelKey: any;
  modelGatewayConfig: any;
  agentModelGatewayConfig: any;
  runtimeMultimodalTypes: any[];
  keyId: number;
  useModel: string;
  additionalParams: any;
  reasoningEffort?: ModelGatewayReasoningEffort;
  useModeName: string;
  modelKey: string;
  maxModelTokens?: number;
}

/**
 * 对话预检域服务：请求体校验、归属与对话组解析、用户状态与敏感词检查、
 * 模型与网关配置解析、限流与余额预检。
 * 任一拒绝路径要么抛 HttpException，要么向 emitter 发 agent.error 并返回 null。
 */
@Injectable()
export class ChatPreflightService {
  constructor(
    private readonly chatLogService: ChatLogService,
    private readonly userService: UserService,
    @Inject(BILLING_PORT) private readonly billing: BillingPort,
    @Inject(CONTENT_FILTER_PORT) private readonly contentFilter: ContentFilterPort,
    private readonly globalConfigService: GlobalConfigService,
    private readonly modelsService: ModelsService,
    private readonly submissions: ChatSubmissionService,
    @Inject('REDIS_CLIENT') private readonly redisClient: RedisClientType,
    @Optional() private readonly chatGroupService?: ChatGroupService,
  ) {}

  async prepareAdmission(
    rawBody: any,
    user: any,
    channel: string | undefined,
    options: {
      operation?: ChatSubmissionOperation;
      strategy?: string;
    } = {},
  ): Promise<ChatAdmissionResult> {
    const body = this.validateChatProcessBody({ ...(rawBody || {}) });
    // 游客只写 visitorId，避免把 visitor:xxx 写入整数型 userId 字段。
    const visitorId = user.role === 'visitor' ? String(user.id) : null;
    const chatUserId = visitorId ? null : Number(user.id);
    const workflowOwnerId = visitorId || chatUserId;

    const { prompt, parentTurnId: parentTurnIdFromBody } = body;
    const parentTurnId = String(parentTurnIdFromBody || '').trim() || undefined;
    const sourceSocketId = String(body.__socketId || '').trim() || undefined;
    const chatChannel = String(channel || 'web')
      .trim()
      .toLowerCase();
    const operation = options.operation || 'chat';
    const chatGroup = await this.resolveChatProcessGroup(body, user, chatChannel);
    const submissionId = String(body.submissionId || '').trim() || null;
    if (chatChannel === 'web' && !submissionId) {
      throw new HttpException('submissionId不能为空', HttpStatus.BAD_REQUEST);
    }
    const submissionFingerprint =
      chatChannel === 'web'
        ? this.submissions.createFingerprint({
            operation,
            body,
            conversationGid: chatGroup.conversationGid,
            strategy: options.strategy,
          })
        : null;

    return {
      body,
      user,
      visitorId,
      chatUserId,
      workflowOwnerId,
      prompt,
      parentTurnId,
      sourceSocketId,
      chatChannel,
      operation,
      strategy: options.strategy,
      submissionId,
      submissionFingerprint,
      chatGroupId: chatGroup.groupId,
      conversationGid: chatGroup.conversationGid,
    };
  }

  async prepareExecution(
    admission: ChatAdmissionResult,
    emitter: StreamEmitter,
  ): Promise<ChatPreflightResult | null> {
    const { body, user, chatUserId, prompt, chatChannel } = admission;
    const preflightIdempotencyKey = this.preflightIdempotencyKey(admission);
    const { modelId, model: modelFromBody } = body;

    // 单个键时 getConfigs 直接返回值（不是对象）
    const systemPreMessage = String(
      (await this.globalConfigService.getConfigs(['systemPreMessage'])) ?? '',
    );

    /* 检测用户状态 */
    await this.userService.checkUserStatus(user);

    /* 内容过滤：实现由扩展包提供，没有实现时直通；命中由内核统一拒绝并累计违规次数 */
    const hit = await this.contentFilter.check({
      text: prompt,
      userId: chatUserId || 0,
      ...(preflightIdempotencyKey ? { idempotencyKey: preflightIdempotencyKey } : {}),
    });
    if (hit) {
      if (user.role !== 'visitor' && chatUserId && !hit.violationCounted) {
        await this.userService.recordContentViolation(chatUserId);
      }
      // 带上错误码：前端按码识别（弹内容违规说明），不再按文案猜
      throw new HttpException(
        {
          message:
            hit.message || '您提交的信息中包含违规的内容，我们已对您的账户进行标记，请合规使用！',
          code: 'CONTENT_VIOLATION',
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    /* 模型解析（含禁用回退） */
    let currentRequestModelKey = null;
    // 渠道（Bot）回合按绑定里记录的模型 id 解析：模型在后台被停用也允许该渠道沿用
    const isExternalChannel = Boolean(chatChannel) && chatChannel !== 'web';

    if (isExternalChannel && modelId) {
      currentRequestModelKey = await this.modelsService.findByIdIncludingDisabled(Number(modelId));
    }
    if (!currentRequestModelKey && modelFromBody) {
      currentRequestModelKey = await this.modelsService.getCurrentModelKeyInfo(modelFromBody);
    } else if (!currentRequestModelKey && modelId !== undefined && modelId !== null) {
      // 既无 model 也无 modelId 时不按 id 查询，直接走下方默认模型回退
      currentRequestModelKey = await this.modelsService.findById(modelId);
    }
    if (!currentRequestModelKey) {
      const baseConfig = await this.modelsService.getBaseConfig();
      if (baseConfig && baseConfig.modelInfo) {
        currentRequestModelKey = await this.modelsService.getCurrentModelKeyInfo(
          baseConfig.modelInfo.model,
        );
      }
    }

    // 构建 system 消息：只保留静态内容，不包含时间和用户个性化信息
    let setSystemMessage = '';
    if (currentRequestModelKey && currentRequestModelKey.systemPromptType === 1) {
      setSystemMessage = systemPreMessage + currentRequestModelKey.systemPrompt;
    } else if (currentRequestModelKey && currentRequestModelKey.systemPromptType === 2) {
      setSystemMessage = currentRequestModelKey.systemPrompt;
    } else {
      setSystemMessage = systemPreMessage;
    }

    // 收集用户个性化信息，稍后追加到最后一条 user 消息
    const now = new Date();
    const currentDate = `${now.getFullYear()}/${String(now.getMonth() + 1).padStart(
      2,
      '0',
    )}/${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:00`;
    let userRuntimeContext = '';
    if (user && chatUserId) {
      const userInfo = await this.userService.getUserById(chatUserId);
      const hasNickname = userInfo?.nickname && userInfo.nickname.trim();
      const hasInstruction = userInfo?.customInstruction && userInfo.customInstruction.trim();

      if (hasNickname || hasInstruction) {
        userRuntimeContext = buildRuntimeContextBlock({
          currentTime: currentDate,
          userName: userInfo.nickname,
          customInstruction: userInfo.customInstruction?.trim() || undefined,
        });
      } else {
        userRuntimeContext = buildRuntimeContextBlock({ currentTime: currentDate });
      }
    } else {
      userRuntimeContext = buildRuntimeContextBlock({ currentTime: currentDate });
    }

    if (!currentRequestModelKey) {
      throw new HttpException(
        '系统未配置任何可用的AI模型，请联系管理员检查模型配置！',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }

    const {
      id: keyId,
      model: useModel,
      multimodalTypes = [],
      additionalParams,
      maxModelTokens,
    } = currentRequestModelKey;
    const modelGatewayConfig = this.modelsService.resolveModelGatewayConfig(currentRequestModelKey);
    const reasoningEffort = resolveModelGatewayReasoningEffort(
      body.reasoningEffort,
      modelGatewayConfig.capabilities,
    );
    const runtimeMultimodalTypes = modelGatewayConfig.capabilities
      ? multimodalTypesFromCapabilities(modelGatewayConfig.capabilities)
      : multimodalTypes;
    const agentModelGatewayConfig =
      maxModelTokens && Number(maxModelTokens) > 0
        ? {
            ...modelGatewayConfig,
            capabilities: {
              ...(modelGatewayConfig.capabilities || {}),
              maxInputTokens: modelGatewayConfig.capabilities?.maxInputTokens || maxModelTokens,
            },
            maxModelTokens,
          }
        : modelGatewayConfig;

    /* 模型频率限流 */
    if (await this.chatLogService.checkModelLimits(user, useModel)) {
      emitter.emit({
        type: 'agent.error',
        chatId: 'pending',
        timestamp: Date.now(),
        data: { code: 'RATE_LIMIT', message: '1 小时内对话次数过多，请切换模型或稍后再试！' },
      });
      return null;
    }

    // 访客 IP 维度限流（防止切换 fingerprint 绕过额度限制）
    if (user.role === 'visitor') {
      const clientIp = body.__clientIp;
      if (clientIp && !(await this.checkVisitorIpLimit(clientIp, preflightIdempotencyKey))) {
        emitter.emit({
          type: 'agent.error',
          chatId: 'pending',
          timestamp: Date.now(),
          data: { code: 'RATE_LIMIT', message: '访客体验次数已达上限，请注册后继续使用！' },
        });
        return null;
      }
    }

    // 计费预检（没有计费实现时放行）
    await this.billing.assertTurnAllowed({
      user,
      model: currentRequestModelKey,
      ...(preflightIdempotencyKey ? { idempotencyKey: preflightIdempotencyKey } : {}),
    });

    return {
      ...admission,
      setSystemMessage,
      userRuntimeContext,
      currentRequestModelKey,
      modelGatewayConfig,
      agentModelGatewayConfig,
      runtimeMultimodalTypes,
      keyId,
      useModel,
      additionalParams,
      reasoningEffort,
      useModeName: currentRequestModelKey?.modelName,
      modelKey: modelGatewayConfig.apiKey,
      maxModelTokens,
    };
  }

  private formatValidationErrors(errors: ValidationError[]): string {
    for (const error of errors) {
      if (error.constraints) {
        const first = Object.values(error.constraints)[0];
        if (first) return first;
      }
      if (error.children?.length) {
        const child = this.formatValidationErrors(error.children);
        if (child) return child;
      }
    }
    return '请求参数格式不正确';
  }

  private validateChatProcessBody(body: any): ChatProcessDto {
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      throw new HttpException('请求参数格式不正确', HttpStatus.BAD_REQUEST);
    }

    const dto = plainToInstance(ChatProcessDto, body, {
      enableImplicitConversion: false,
    });
    const errors = validateSync(dto, {
      whitelist: true,
      forbidNonWhitelisted: true,
      validationError: { target: false, value: false },
    });

    if (errors.length > 0) {
      throw new HttpException(this.formatValidationErrors(errors), HttpStatus.BAD_REQUEST);
    }

    return dto;
  }

  private async resolveChatProcessGroup(
    body: ChatProcessDto,
    user: any,
    channel = 'web',
    parentConversationGid?: string,
  ): Promise<{
    groupId: number;
    conversationGid: string;
  }> {
    const gid = parentConversationGid || (typeof body.gid === 'string' ? body.gid.trim() : '');
    const normalizedChannel = String(channel || 'web')
      .trim()
      .toLowerCase();

    if (
      !this.chatGroupService ||
      typeof this.chatGroupService.resolveGroupByGidForUser !== 'function'
    ) {
      throw new HttpException('会话服务不可用，无法写入消息', HttpStatus.SERVICE_UNAVAILABLE);
    }

    if (normalizedChannel === 'web') {
      if (!gid) {
        throw new HttpException('Web 消息必须指定会话', HttpStatus.BAD_REQUEST);
      }
      const group = await this.chatGroupService.resolveGroupByGidForUser(gid, user);
      return {
        groupId: group.id,
        conversationGid: group.gid,
      };
    }

    if (gid) {
      throw new HttpException('外部渠道不能通过请求体指定会话', HttpStatus.BAD_REQUEST);
    }

    if (typeof this.chatGroupService.resolveExternalConversation !== 'function') {
      throw new HttpException('外部渠道会话解析不可用', HttpStatus.SERVICE_UNAVAILABLE);
    }
    const group = await this.chatGroupService.resolveExternalConversation(user, normalizedChannel);
    return {
      groupId: group.id,
      conversationGid: group.gid,
    };
  }

  private preflightIdempotencyKey(admission: ChatAdmissionResult): string | undefined {
    const digest = String(admission.submissionFingerprint?.digest || '').toLowerCase();
    const submissionId = String(admission.submissionId || '').trim();
    if (!submissionId || !/^[a-f0-9]{64}$/u.test(digest)) return undefined;
    const ownerKey =
      admission.user?.role === 'visitor'
        ? `visitor:${String(admission.visitorId || admission.workflowOwnerId || '')}`
        : `user:${String(admission.chatUserId || admission.workflowOwnerId || '')}`;
    return createHash('sha256')
      .update(
        `${admission.submissionFingerprint?.version || 0}\u0000${ownerKey}\u0000${submissionId}\u0000${digest}`,
        'utf8',
      )
      .digest('hex');
  }

  private async checkVisitorIpLimit(ip: string, idempotencyKey?: string): Promise<boolean> {
    const key = `visitor:ip:${ip}`;
    if (idempotencyKey) {
      const marker = createHash('sha256')
        .update(`${ip}\u0000${idempotencyKey}`, 'utf8')
        .digest('hex');
      const result = await this.redisClient.eval(
        `
        local previous = redis.call('GET', KEYS[2])
        if previous then
          return tonumber(previous)
        end
        local current = redis.call('INCR', KEYS[1])
        if current == 1 then
          redis.call('EXPIRE', KEYS[1], ARGV[1])
        end
        local allowed = 0
        if current <= tonumber(ARGV[2]) then
          allowed = 1
        end
        redis.call('SET', KEYS[2], tostring(allowed), 'EX', ARGV[1])
        return allowed
        `,
        {
          keys: [key, `visitor:ip:submission:${marker}`],
          arguments: ['3600', '30'],
        },
      );
      if (Number(result) !== 0 && Number(result) !== 1) {
        throw new Error('Visitor IP limit returned an invalid result');
      }
      return Number(result) === 1;
    }
    const current = await this.redisClient.incr(key);
    // 首次设置时加过期时间
    if (current === 1) {
      await this.redisClient.expire(key, 3600);
    }
    // 每个IP每小时最多 30 次
    return current <= 30;
  }
}
