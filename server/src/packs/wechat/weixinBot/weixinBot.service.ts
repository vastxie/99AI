import {
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  Logger,
  OnModuleDestroy,
} from '@nestjs/common';
import { getErrorStack } from '@/common/utils/error-stack.util';
import { InjectRepository } from '@nestjs/typeorm';
import { RedisClientType } from 'redis';
import { Repository } from 'typeorm';
import { ChatService } from '@/modules/chat/chat.service';
import { GlobalConfigRegistry } from '@/modules/globalConfig/global-config.registry';
import { GlobalConfigService } from '@/modules/globalConfig/globalConfig.service';
import { ModelsService } from '@/modules/models/models.service';
import { UserEntity } from '@/modules/user/user.entity';
import { WeixinApiClient } from './utils/weixin-api-client';
import { WeixinCrypto } from './utils/weixin-crypto';
import { WeixinMessage, BindSession, WeixinBindStatus } from './types/weixin-message.types';
import { WeixinEmitter } from './emitters/weixin-emitter';
import { downloadAndDecryptMedia } from './utils/weixin-media';
import { BaseBotService } from '../bot/base-bot.service';
import { BotChannel } from '../bot/bot-channel.config';
import { ChannelManagerService } from '../bot/channel-manager.service';
import { ChannelRegistry } from '../bot/channel-registry';
import { MediaItem } from '../bot/types/bot.types';
import { VoiceRecognitionService } from './utils/voice-recognition';
import { FileAssetService } from '@/modules/fileAsset/fileAsset.service';
import * as QRCode from 'qrcode';

const BIND_SESSION_PREFIX = 'weixin:bind:';
const BIND_SESSION_TTL = 300;
const DEFAULT_WEIXIN_SEND_FILE_LIMIT_MB = 100;

@Injectable()
export class WeixinBotService extends BaseBotService implements OnModuleDestroy {
  get channel(): BotChannel {
    return BotChannel.WEIXIN;
  }
  get channelName(): string {
    return '微信Bot';
  }
  get featureConfigKey(): string {
    return 'weixinBotStatus';
  }

  private pollingTasks = new Map<number, PollingTask>();
  private apiClients = new Map<number, WeixinApiClient>();
  /** userId -> 最近一次启动 / 停止轮询的代次：启动途中被停止或被新的启动取代时放弃启动 */
  private pollingGenerations = new Map<number, number>();

  private readonly redisClient: RedisClientType;
  private readonly channelManager: ChannelManagerService;
  private readonly voiceRecognition: VoiceRecognitionService;
  private readonly fileAssetService: FileAssetService;

  constructor(
    @InjectRepository(UserEntity)
    userEntity: Repository<UserEntity>,
    chatService: ChatService,
    globalConfigService: GlobalConfigService,
    modelsService: ModelsService,
    @Inject('REDIS_CLIENT') redisClient: RedisClientType,
    channelManager: ChannelManagerService,
    private readonly channelRegistry: ChannelRegistry,
    voiceRecognition: VoiceRecognitionService,
    fileAssetService: FileAssetService,
    configRegistry: GlobalConfigRegistry,
  ) {
    super({
      userEntity,
      chatService,
      globalConfigService,
      modelsService,
      channelManager,
    });
    this.redisClient = redisClient;
    this.channelManager = channelManager;
    this.voiceRecognition = voiceRecognition;
    this.fileAssetService = fileAssetService;
    this.channelRegistry.register(BotChannel.WEIXIN, this);
    // 后台开关即时生效：关闭时停掉全部轮询，打开时恢复已绑定的用户（不必等重启）
    configRegistry.register({
      name: 'weixin-bot-switch',
      onChanged: keys => this.onFeatureSwitchChanged(keys),
    });
  }

  private async onFeatureSwitchChanged(changedKeys: readonly string[]): Promise<void> {
    if (!changedKeys.includes(this.featureConfigKey)) return;
    if (await this.isFeatureEnabled()) {
      await this.onModuleInit();
      return;
    }
    for (const userId of [...this.pollingTasks.keys()]) {
      await this.stopUser(userId);
    }
    Logger.log('微信Bot 功能已关闭，已停止全部轮询', 'WeixinBotService');
  }

  private async assertFeatureEnabled(): Promise<void> {
    if (!(await this.isFeatureEnabled())) {
      throw new HttpException('微信Bot 功能未开启', HttpStatus.FORBIDDEN);
    }
  }

  protected async findBoundUsers(): Promise<Array<{ id: number; [key: string]: any }>> {
    const channels = await this.channelManager.findBoundChannels(BotChannel.WEIXIN);
    return channels.map(c => ({
      id: c.userId,
      accessToken: c.accessToken,
      baseUrl: c.baseUrl,
    }));
  }

  protected async startReceiving(userId: number): Promise<void> {
    await this.startPolling(userId);
  }

  protected async getChannelModelConfig(): Promise<any> {
    const configuredModelId = await this.deps.globalConfigService.getConfigs(['weixinBotModelId']);
    const modelId = Number(configuredModelId);

    if (Number.isInteger(modelId) && modelId > 0) {
      const modelConfig = await this.deps.modelsService.getConfigByModelId(modelId, true);
      if (modelConfig?.modelInfo) {
        return modelConfig;
      }
      Logger.warn(`微信Bot配置的模型 ID ${modelId} 不存在，已回退系统默认模型`, this.channelName);
    }

    return super.getChannelModelConfig();
  }

  private async resolveWeixinSendMaxFileSizeMb(): Promise<number> {
    const configured = await this.deps.globalConfigService.getConfigs([
      'weixinBotSendMaxFileSizeMb',
    ]);
    const maxFileSizeMb = Number(configured);

    if (Number.isFinite(maxFileSizeMb) && maxFileSizeMb > 0) {
      return Math.min(maxFileSizeMb, DEFAULT_WEIXIN_SEND_FILE_LIMIT_MB);
    }

    return DEFAULT_WEIXIN_SEND_FILE_LIMIT_MB;
  }

  protected async stopReceiving(userId: number): Promise<void> {
    await this.stopPolling(userId);
  }

  protected cleanupUserState(userId: number): void {
    const cached = this.pendingMedia.get(userId);
    if (cached) {
      clearTimeout(cached.timer);
      this.pendingMedia.delete(userId);
    }
    this.messageQueues.delete(userId);
  }

  async onModuleDestroy(): Promise<void> {
    for (const [userId] of this.pollingTasks) {
      await this.stopPolling(userId);
    }
    await super.onModuleDestroy();
  }

  /* ---- 绑定流程 ---- */

  async getBindQrCode(userId: number): Promise<{ qrData: string; sessionId: string }> {
    await this.assertFeatureEnabled();
    const existing = await this.channelManager.getChannelStatus(userId, BotChannel.WEIXIN);
    if (existing?.status === 1) {
      throw new HttpException('您已绑定微信Bot，请先解绑后再重新绑定', HttpStatus.BAD_REQUEST);
    }

    const sessionId = `bind_${userId}_${Date.now()}_${Math.random().toString(36).slice(2)}`;

    const tempClient = new WeixinApiClient({
      botToken: '',
      baseUrl: 'https://ilinkai.weixin.qq.com',
    });

    try {
      const qrResult = await tempClient.getBotQrCode();
      const qrInput = qrResult.qrcode_img_content || qrResult.qrcode;
      if (!qrInput) {
        throw new Error('微信 API 未返回二维码数据');
      }
      // qrcode 是后续 get_qrcode_status 轮询的凭据：缺失时会话只会一直停在 waiting，这里直接失败让前端可见
      if (!qrResult.qrcode) {
        throw new Error('微信 API 未返回二维码轮询凭据 qrcode');
      }

      const qrDataUrl = await QRCode.toDataURL(qrInput, {
        width: 280,
        margin: 2,
        color: { dark: '#000000', light: '#ffffff' },
      });

      const session: BindSession = {
        status: 'waiting',
        userId,
        qrData: qrDataUrl,
        qrcode: qrResult.qrcode,
        createdAt: Date.now(),
      };
      await this.redisClient.set(`${BIND_SESSION_PREFIX}${sessionId}`, JSON.stringify(session), {
        EX: BIND_SESSION_TTL,
      });

      return { qrData: qrDataUrl, sessionId };
    } catch (error: any) {
      Logger.error(
        `获取微信Bot二维码失败: ${error.message}`,
        getErrorStack(error),
        'WeixinBotService',
      );
      throw new HttpException('获取微信二维码失败，请稍后再试', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  async pollBindStatus(userId: number, sessionId: string): Promise<BindSession> {
    const raw = await this.redisClient.get(`${BIND_SESSION_PREFIX}${sessionId}`);
    if (!raw) {
      throw new HttpException('绑定会话不存在或已过期', HttpStatus.NOT_FOUND);
    }

    const session: BindSession = JSON.parse(raw);

    if (session.userId !== undefined && session.userId !== userId) {
      throw new HttpException('无权访问此绑定会话', HttpStatus.FORBIDDEN);
    }

    if (session.status === 'waiting' || session.status === 'scanned') {
      // qrcode 是 get_qrcode_status 的必要凭据：缺失时轮询只会一直软失败，直接报错让调用方重新获取二维码
      if (!session.qrcode) {
        throw new HttpException('绑定会话缺少二维码凭据，请重新获取二维码', HttpStatus.BAD_REQUEST);
      }
      try {
        const tempClient = new WeixinApiClient({
          botToken: '',
          baseUrl: 'https://ilinkai.weixin.qq.com',
        });
        const statusResult = await tempClient.getQrCodeStatus(session.qrcode);

        if (statusResult.status === 'scaned') {
          session.status = 'scanned';
          await this.redisClient.set(
            `${BIND_SESSION_PREFIX}${sessionId}`,
            JSON.stringify(session),
            { EX: BIND_SESSION_TTL },
          );
        } else if (statusResult.status === 'confirmed') {
          // 微信确认了扫码却没有下发 bot_token：不能标记 confirmed（后续 confirmBind 会拿 undefined 去加密），直接报错
          if (!statusResult.bot_token) {
            throw new HttpException(
              '微信未返回 Bot 凭据，请重新获取二维码',
              HttpStatus.BAD_GATEWAY,
            );
          }
          session.status = 'confirmed';
          session.botToken = statusResult.bot_token;
          session.baseUrl = statusResult.baseurl || 'https://ilinkai.weixin.qq.com';
          session.weixinUserId = statusResult.ilink_user_id;
          await this.redisClient.set(
            `${BIND_SESSION_PREFIX}${sessionId}`,
            JSON.stringify(session),
            { EX: BIND_SESSION_TTL },
          );
        } else if (statusResult.status === 'expired') {
          session.status = 'expired';
          await this.redisClient.set(
            `${BIND_SESSION_PREFIX}${sessionId}`,
            JSON.stringify(session),
            { EX: 30 },
          );
        }
      } catch (error: any) {
        if (error instanceof HttpException) {
          throw error;
        }
        Logger.debug(`轮询绑定状态异常: ${error.message}`, 'WeixinBotService');
      }
    }

    return {
      status: session.status,
      userId: session.userId,
      qrData: session.qrData,
      createdAt: session.createdAt,
    };
  }

  async confirmBind(userId: number, sessionId: string): Promise<void> {
    await this.assertFeatureEnabled();
    const lockKey = `${BIND_SESSION_PREFIX}lock:${sessionId}`;
    const locked = await this.redisClient.set(lockKey, '1', { NX: true, EX: 10 } as any);
    if (!locked) {
      throw new HttpException('绑定处理中，请稍候', HttpStatus.CONFLICT);
    }

    try {
      const raw = await this.redisClient.get(`${BIND_SESSION_PREFIX}${sessionId}`);
      if (!raw) {
        throw new HttpException('绑定会话不存在或已过期，请重新获取二维码', HttpStatus.NOT_FOUND);
      }

      const session: BindSession = JSON.parse(raw);

      if (session.userId !== undefined && session.userId !== userId) {
        throw new HttpException('无权访问此绑定会话', HttpStatus.FORBIDDEN);
      }

      if (session.status !== 'confirmed') {
        throw new HttpException('二维码尚未确认，请先扫码确认', HttpStatus.BAD_REQUEST);
      }

      // botToken 由 pollBindStatus 在 confirmed 时写入；缺失说明会话数据不完整，不能拿 undefined 去加密
      if (!session.botToken) {
        throw new HttpException(
          '绑定会话缺少微信 Bot 凭据，请重新扫码绑定',
          HttpStatus.BAD_REQUEST,
        );
      }
      const encryptedToken = await WeixinCrypto.encrypt(session.botToken, this.redisClient);

      await this.channelManager.bindChannel(userId, BotChannel.WEIXIN, {
        accessToken: encryptedToken,
        baseUrl: session.baseUrl,
        channelUserId: session.weixinUserId,
      });

      await this.redisClient.del(`${BIND_SESSION_PREFIX}${sessionId}`);
      await this.startPolling(userId);

      Logger.log(`用户 ${userId} 绑定微信Bot成功`, 'WeixinBotService');
    } finally {
      await this.redisClient.del(lockKey);
    }
  }

  async unbindBot(userId: number): Promise<void> {
    await this.stopPolling(userId);
    await this.channelManager.unbindChannel(userId, BotChannel.WEIXIN);
    this.cleanupUserState(userId);
    Logger.log(`用户 ${userId} 解绑微信Bot`, 'WeixinBotService');
  }

  async getBindStatus(userId: number): Promise<WeixinBindStatus> {
    const channelStatus = await this.channelManager.getChannelStatus(userId, BotChannel.WEIXIN);
    if (!channelStatus) {
      return { bound: false, status: 0 };
    }
    return {
      bound: channelStatus.status === 1,
      status: channelStatus.status,
      boundAt: channelStatus.boundAt,
      weixinUserId: channelStatus.channelUserId || undefined,
    };
  }

  /* ---- 轮询管理 ---- */

  private async startPolling(userId: number): Promise<void> {
    if (this.pollingTasks.has(userId)) {
      this.stopPolling(userId);
    }
    const generation = this.nextPollingGeneration(userId);

    const channelStatus = await this.channelManager.getChannelStatus(userId, BotChannel.WEIXIN);
    if (!channelStatus?.accessToken) {
      Logger.warn(`用户 ${userId} 没有微信Bot凭证，跳过轮询`, 'WeixinBotService');
      return;
    }

    let botToken: string;
    try {
      botToken = await WeixinCrypto.decrypt(channelStatus.accessToken, this.redisClient);
    } catch {
      Logger.error(`用户 ${userId} 的微信Bot凭证解密失败`, 'WeixinBotService');
      await this.channelManager.updateStatus(userId, BotChannel.WEIXIN, 3);
      return;
    }

    const initialSyncBuf = await this.channelManager.getSyncState(userId, BotChannel.WEIXIN);
    // 最后一次 await 之后再复查：启动途中被解绑、被关闭功能或被新的启动取代时不再启动。
    // 复查与登记之间没有 await，关闭开关的回调要么看到这个任务并停掉它，要么这里已经看到关闭
    const enabled = await this.isFeatureEnabled();
    if (this.pollingGenerations.get(userId) !== generation) return;
    if (!enabled) {
      Logger.log(`微信Bot 功能未开启，跳过用户 ${userId} 的轮询`, 'WeixinBotService');
      return;
    }

    const apiClient = new WeixinApiClient({
      botToken,
      baseUrl: channelStatus.baseUrl || undefined,
    });
    this.apiClients.set(userId, apiClient);

    const task = new PollingTask(userId, apiClient, {
      syncBuf: initialSyncBuf,
      onSyncBufUpdate: (buf: string) =>
        this.channelManager.updateSyncState(userId, BotChannel.WEIXIN, buf),
      onMessage: msg =>
        this.enqueueMessage(userId, () =>
          this.handleIncomingMessage(userId, msg, apiClient, generation),
        ),
      onError: err => this.handlePollingError(userId, err),
      onSessionExpired: () => this.handleSessionExpired(userId),
    });

    this.pollingTasks.set(userId, task);
    task.start();
    Logger.log(`用户 ${userId} 的微信轮询已启动`, 'WeixinBotService');
  }

  /**
   * 处理消息、发起对话前复查：功能仍开启，且仍是收到消息时的那次轮询（中途关闭、解绑或重新启动都作废）。
   * 复查之后同步发起对话，关闭开关的回调插不进两者之间
   */
  private async isPollingSessionCurrent(
    userId: number,
    generation: number | undefined,
  ): Promise<boolean> {
    const enabled = await this.isFeatureEnabled();
    return enabled && this.pollingGenerations.get(userId) === generation;
  }

  private nextPollingGeneration(userId: number): number {
    const generation = (this.pollingGenerations.get(userId) ?? 0) + 1;
    this.pollingGenerations.set(userId, generation);
    return generation;
  }

  private stopPolling(userId: number): void {
    // 让途中的启动作废
    this.nextPollingGeneration(userId);
    const task = this.pollingTasks.get(userId);
    if (task) {
      task.stop();
      this.pollingTasks.delete(userId);
    }
    this.apiClients.delete(userId);
  }

  private async handleIncomingMessage(
    userId: number,
    message: WeixinMessage,
    apiClient: WeixinApiClient,
    generation?: number,
  ): Promise<void> {
    // 关闭功能、解绑或重新启动前已经排进队列的消息不再处理
    if (!(await this.isPollingSessionCurrent(userId, generation))) return;
    // 消息幂等检查：message_id 缺失的消息没有稳定键，不参与去重（否则会以字符串 'undefined' 作键，把后续消息全部当成重复丢弃）
    const channelMsgId =
      message.message_id !== undefined && message.message_id !== null
        ? `${message.message_id}`
        : undefined;
    if (channelMsgId !== undefined) {
      const isDuplicate = await this.channelManager.checkMessageDup(
        BotChannel.WEIXIN,
        channelMsgId,
      );
      if (isDuplicate) {
        Logger.debug(`跳过重复微信消息: ${channelMsgId}`, 'WeixinBotService');
        return;
      }
    } else {
      // 上游开始不带 message_id 时运维要能察觉：这类消息无法幂等，重投会被处理两次
      Logger.warn('微信消息缺少 message_id，跳过幂等去重', 'WeixinBotService');
    }

    const text = this.extractText(message);
    // PollingTask 只投递 from_user_id 非空的消息
    const fromUserId = message.from_user_id!;
    const mediaItems: MediaItem[] = [];
    let voiceText: string | null = null;

    Logger.debug(
      `收到微信消息: type=${message.message_type}, items=${JSON.stringify(
        message.item_list?.map(i => ({ type: i.type, keys: Object.keys(i || {}) })),
      )}`,
      'WeixinBotService',
    );

    if (message.item_list?.length) {
      for (const item of message.item_list) {
        if (item.type !== 1) {
          Logger.debug(
            `媒体消息详情: type=${item.type}, image_item=${JSON.stringify(
              item.image_item,
            )}, video_item=${JSON.stringify(item.video_item)}, file_item=${JSON.stringify(
              item.file_item,
            )}`,
            'WeixinBotService',
          );
        }
      }
    }

    if (message.item_list?.length) {
      for (const item of message.item_list) {
        try {
          if (item.type === 2 && item.image_item?.media) {
            const media = await this.downloadAndSaveMedia(userId, item.image_item.media, 'image');
            if (media) mediaItems.push(media);
          } else if (item.type === 5 && item.video_item?.media) {
            const media = await this.downloadAndSaveMedia(userId, item.video_item.media, 'video');
            if (media) mediaItems.push(media);
          } else if (item.type === 4 && item.file_item?.media) {
            const media = await this.downloadAndSaveMedia(
              userId,
              item.file_item.media,
              'file',
              item.file_item?.file_name,
            );
            if (media) mediaItems.push(media);
          } else if (item.type === 3 && item.voice_item?.media) {
            try {
              const silkBuffer = await this.downloadVoiceMedia(item.voice_item.media);
              if (silkBuffer) {
                voiceText = await this.voiceRecognition.recognizeVoice(silkBuffer);
                if (!voiceText) {
                  Logger.warn('语音识别未返回结果，可能未开启或未配置识别服务', 'WeixinBotService');
                }
              }
            } catch (error: any) {
              Logger.error(
                `语音识别失败: ${error.message}`,
                getErrorStack(error),
                'WeixinBotService',
              );
            }
          }
        } catch (error: any) {
          Logger.error(
            `下载微信媒体失败: ${error.message}`,
            getErrorStack(error),
            'WeixinBotService',
          );
        }
      }
    }

    const hasText = !!text?.trim();
    const hasVoiceText = !!voiceText?.trim();
    const hasMedia = mediaItems.length > 0;

    const hasVoiceMessage = message.item_list?.some(i => i.type === 3) || false;

    if (!hasText && !hasVoiceText) {
      if (hasMedia) {
        // 下载媒体期间可能被关闭或重启：只缓存仍属于当前这次轮询的媒体
        if (!(await this.isPollingSessionCurrent(userId, generation))) return;
        this.cacheMediaItems(
          userId,
          mediaItems,
          message.context_token,
          message.from_user_id,
          generation,
        );
        return;
      }
      try {
        const reply = hasVoiceMessage
          ? '语音识别暂不可用，请发送文字消息。'
          : '暂不支持该消息类型，目前仅支持文本、图片、视频和文件。';
        await apiClient.sendMessage({
          to_user_id: fromUserId,
          context_token: message.context_token,
          item_list: [
            {
              type: 1,
              text_item: { text: reply },
            },
          ],
        });
      } catch {}
      return;
    }

    // 合并文本和语音识别结果
    const promptParts: string[] = [];
    // hasVoiceText / hasText 已分别保证 voiceText / text 非空
    if (hasVoiceText) promptParts.push(`[语音转文字] ${voiceText!.trim()}`);
    if (hasText) promptParts.push(text!.trim());

    // 下载媒体、识别语音期间可能被关闭或重启：旧消息不能消费新一次轮询的媒体缓存，也不能写回自己的上下文。
    // 复查之后同步取缓存、发起写上下文，中间没有 await；只合并这次轮询里缓存的媒体
    if (!(await this.isPollingSessionCurrent(userId, generation))) return;
    const cachedMedia =
      this.pendingMedia.get(userId)?.generation === generation
        ? this.clearPendingMedia(userId)
        : null;
    const allMedia = cachedMedia ? [...cachedMedia, ...mediaItems] : mediaItems;

    if (message.context_token) {
      await this.channelManager.updateContextToken(
        userId,
        BotChannel.WEIXIN,
        message.context_token,
      );
    }

    const maxFileSizeMb = await this.resolveWeixinSendMaxFileSizeMb();

    const emitter = new WeixinEmitter({
      toUserId: fromUserId,
      contextToken: message.context_token,
      apiClient,
      ownerUserId: userId,
      fileAssetService: this.fileAssetService,
      maxFileSizeMb,
    });

    const prompt = promptParts.join('\n');
    if (allMedia.length > 0) {
      Logger.log(
        `微信消息含 ${allMedia.length} 个媒体: ${JSON.stringify(
          allMedia.map(m => m.type + ':' + m.url?.substring(0, 60)),
        )}`,
        'WeixinBotService',
      );
    }

    try {
      // 下载媒体、保存上下文、查用户与模型期间都可能被关闭：在真正发起对话前复查
      await this.invokeChatProcess(userId, prompt, emitter, allMedia, channelMsgId, () =>
        this.isPollingSessionCurrent(userId, generation),
      );
    } catch (error: any) {
      Logger.error(
        `微信消息 chatProcess 异常, userId: ${userId}: ${error.message}`,
        getErrorStack(error),
        'WeixinBotService',
      );

      try {
        await apiClient.sendMessage({
          to_user_id: fromUserId,
          context_token: message.context_token,
          item_list: [{ type: 1, text_item: { text: '处理消息时遇到问题，请稍后重试' } }],
        });
      } catch {}
    }
  }

  protected flushPendingMedia(userId: number): void {
    const cached = this.pendingMedia.get(userId);
    if (!cached) return;
    this.pendingMedia.delete(userId);

    Logger.log(
      `用户 ${userId} 微信媒体缓存超时，自动处理 ${cached.mediaItems.length} 个媒体`,
      'WeixinBotService',
    );

    const apiClient = this.apiClients.get(userId);
    if (!apiClient) return;
    // 按缓存时的那次轮询判断：之后被关闭或重启过的不再投递
    const generation = cached.generation;

    this.enqueueMessage(userId, async () => {
      // 媒体缓存超时投递不经过 handleIncomingMessage，同样要复查功能开关与轮询代次
      if (!(await this.isPollingSessionCurrent(userId, generation))) return;
      if (cached.contextToken) {
        await this.channelManager.updateContextToken(
          userId,
          BotChannel.WEIXIN,
          cached.contextToken,
        );
      }

      const maxFileSizeMb = await this.resolveWeixinSendMaxFileSizeMb();
      const emitter = new WeixinEmitter({
        // 缓存时写入的是 handleIncomingMessage 里已保证非空的 from_user_id
        toUserId: cached.fromUserId!,
        contextToken: cached.contextToken,
        apiClient,
        ownerUserId: userId,
        fileAssetService: this.fileAssetService,
        maxFileSizeMb,
      });

      try {
        await this.invokeChatProcess(
          userId,
          '请查看用户发送的媒体内容并给出回应',
          emitter,
          cached.mediaItems,
          undefined,
          () => this.isPollingSessionCurrent(userId, generation),
        );
      } catch (error: any) {
        Logger.error(
          `微信媒体缓存超时处理异常, userId: ${userId}: ${error.message}`,
          getErrorStack(error),
          'WeixinBotService',
        );
      }
    });
  }

  private async downloadVoiceMedia(cdnMedia: {
    encrypt_query_param?: string;
    aes_key?: string;
    full_url?: string;
  }): Promise<Buffer | null> {
    if (!cdnMedia.encrypt_query_param || !cdnMedia.aes_key) {
      Logger.warn('微信语音缺少 CDN 加密参数', 'WeixinBotService');
      return null;
    }
    try {
      const decrypted = await downloadAndDecryptMedia(
        cdnMedia.encrypt_query_param,
        cdnMedia.aes_key,
        cdnMedia.full_url,
      );
      if (decrypted.length === 0) return null;
      Logger.log(`微信语音下载解密完成, 大小: ${decrypted.length} 字节`, 'WeixinBotService');
      return decrypted;
    } catch (error: any) {
      Logger.error(`下载微信语音失败: ${error.message}`, getErrorStack(error), 'WeixinBotService');
      return null;
    }
  }

  private async downloadAndSaveMedia(
    userId: number,
    cdnMedia: { encrypt_query_param?: string; aes_key?: string; full_url?: string },
    category: MediaItem['type'],
    fileName?: string,
  ): Promise<MediaItem | null> {
    if (!cdnMedia.encrypt_query_param || !cdnMedia.aes_key) {
      Logger.warn(`微信${category}缺少 CDN 加密参数`, 'WeixinBotService');
      return null;
    }

    const decrypted = await downloadAndDecryptMedia(
      cdnMedia.encrypt_query_param,
      cdnMedia.aes_key,
      cdnMedia.full_url,
    );

    Logger.log(`微信${category}下载解密完成, 大小: ${decrypted.length} 字节`, 'WeixinBotService');

    if (decrypted.length === 0) {
      return null;
    }

    const mimetype = this.detectMimeType(decrypted, category, fileName);
    const name = this.buildWeixinMediaName(category, mimetype, fileName);
    const file = await this.fileAssetService.createFromBuffer({
      buffer: decrypted,
      name,
      mime: mimetype,
      userId,
      origin: 'weixin_bot',
      category: category === 'file' ? 'file' : 'media',
      purpose:
        category === 'image'
          ? 'chat_image'
          : category === 'video'
            ? 'chat_video'
            : category === 'audio'
              ? 'chat_audio'
              : 'chat_file',
      visibility: 'private',
      allowPreview: category !== 'file',
      allowDownload: true,
      metadata: {
        source: 'weixin_bot',
        mediaType: category,
      },
    });

    const url = file.previewUrl || file.downloadUrl || `/api/files/${file.fileId}/download`;
    return {
      type: category,
      url,
      fileId: file.fileId,
      previewUrl: file.previewUrl,
      downloadUrl: file.downloadUrl,
      name,
      mime: file.mime || mimetype,
      size: file.size || decrypted.length,
    };
  }

  private buildWeixinMediaName(
    category: MediaItem['type'],
    mime: string,
    fileName?: string,
  ): string {
    const safeName = String(fileName || '').trim();
    if (safeName) return safeName;

    const extMap: Record<string, string> = {
      'image/jpeg': 'jpg',
      'image/png': 'png',
      'image/gif': 'gif',
      'image/webp': 'webp',
      'image/bmp': 'bmp',
      'video/mp4': 'mp4',
      'video/webm': 'webm',
      'video/quicktime': 'mov',
      'audio/mpeg': 'mp3',
      'audio/wav': 'wav',
      'application/pdf': 'pdf',
    };
    const fallbackExt =
      extMap[String(mime || '').toLowerCase()] ||
      (category === 'image'
        ? 'jpg'
        : category === 'video'
          ? 'mp4'
          : category === 'audio'
            ? 'mp3'
            : 'bin');
    return `weixin-${category}-${Date.now()}.${fallbackExt}`;
  }

  private extractText(message: WeixinMessage): string | null {
    if (!message.item_list?.length) return null;
    for (const item of message.item_list) {
      if (item.type === 1 && item.text_item?.text) {
        return item.text_item.text;
      }
    }
    return null;
  }

  private handlePollingError(userId: number, error: Error): void {
    Logger.error(
      `用户 ${userId} 微信轮询出错: ${error.message}`,
      getErrorStack(error),
      'WeixinBotService',
    );
  }

  private async handleSessionExpired(userId: number): Promise<void> {
    Logger.log(`用户 ${userId} 微信会话过期`, 'WeixinBotService');
    await this.stopPolling(userId);
    await this.channelManager.updateStatus(userId, BotChannel.WEIXIN, 2);
  }
}

class PollingTask {
  private running = false;
  private abortController: AbortController | null = null;
  private currentSyncBuf: string | undefined;
  private retryCount = 0;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  /** 已投递消息的 message_id；协议里该字段可选，缺失的消息不参与去重 */
  private processedMsgIds = new Set<number>();
  private static readonly MAX_PROCESSED_CACHE = 200;

  constructor(
    private readonly userId: number,
    private readonly apiClient: WeixinApiClient,
    private readonly handlers: {
      onMessage: (msg: WeixinMessage) => void;
      onError: (err: Error) => void;
      onSessionExpired: () => void | Promise<void>;
      onSyncBufUpdate: (buf: string) => void | Promise<void>;
      syncBuf?: string;
    },
  ) {
    this.currentSyncBuf = handlers.syncBuf;
  }

  start(): void {
    this.running = true;
    this.retryCount = 0;
    this.poll();
  }

  stop(): void {
    this.running = false;
    this.abortController?.abort();
    if (this.retryTimer) {
      clearTimeout(this.retryTimer);
      this.retryTimer = null;
    }
  }

  private poll(): void {
    if (!this.running) return;

    this.abortController = new AbortController();

    void this.apiClient
      .getUpdates(this.currentSyncBuf, this.abortController.signal)
      .then(async response => {
        // 停止后才返回的响应不再投递
        if (!this.running) return;
        this.retryCount = 0;

        if (response.get_updates_buf) {
          this.currentSyncBuf = response.get_updates_buf;
          // 游标落库是异步的：等它完成再进下一轮，保存顺序与游标顺序一致；
          // 落库失败（数据库或 Redis 抖动）只记警告，本批消息照常投递，下次拿到新游标时再保存。
          // 不能放任它变成未处理的 Promise 拒绝，那会让整个服务进程退出
          try {
            await this.handlers.onSyncBufUpdate(response.get_updates_buf);
          } catch (error: any) {
            Logger.warn(
              `用户 ${this.userId} 微信轮询游标保存失败，下次更新时重试: ${error?.message}`,
              'PollingTask',
            );
          }
        }

        if (!this.running) return;
        if (response.msgs?.length) {
          for (const msg of response.msgs) {
            if (msg.message_type !== 1 || !msg.from_user_id) continue;
            const messageId = msg.message_id;
            // message_id 缺失的消息不参与去重：不能以 undefined 作键，否则第二条起都会被当成重复丢弃
            if (messageId !== undefined && messageId !== null) {
              if (this.processedMsgIds.has(messageId)) continue;
              this.processedMsgIds.add(messageId);
              if (this.processedMsgIds.size > PollingTask.MAX_PROCESSED_CACHE) {
                const arr = Array.from(this.processedMsgIds);
                for (let i = 0; i < 50; i++) this.processedMsgIds.delete(arr[i]);
              }
            } else {
              Logger.warn('微信轮询收到缺少 message_id 的消息，未参与去重', 'WeixinBotService');
            }
            this.handlers.onMessage(msg);
          }
        }

        if (this.running) {
          this.poll();
        }
      })
      .catch((error: any) => {
        if (!this.running) return;

        if (error.name === 'AbortError' || error.code === 'ERR_CANCELED') return;

        if (error?.response?.data?.errcode === -14) {
          Logger.log(`用户 ${this.userId} 微信会话已过期(errcode=-14)`, 'PollingTask');
          void Promise.resolve()
            .then(() => this.handlers.onSessionExpired())
            .catch((expiredError: any) =>
              Logger.error(
                `用户 ${this.userId} 微信会话过期处理失败: ${expiredError?.message}`,
                getErrorStack(expiredError),
                'PollingTask',
              ),
            );
          return;
        }

        this.retryCount++;
        const delay = Math.min(1000 * Math.pow(2, this.retryCount - 1), 60000);
        Logger.warn(
          `用户 ${this.userId} 微信轮询出错，${delay / 1000}s 后重试(第${this.retryCount}次): ${
            error.message
          }`,
          'PollingTask',
        );
        this.handlers.onError(error);

        this.retryTimer = setTimeout(() => {
          if (this.running) this.poll();
        }, delay);
      });
  }
}
