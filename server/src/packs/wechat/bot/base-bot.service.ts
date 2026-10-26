import { getErrorStack } from '@/common/utils/error-stack.util';
import { Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Repository } from 'typeorm';
import { ChatService } from '@/modules/chat/chat.service';
import { GlobalConfigService } from '@/modules/globalConfig/globalConfig.service';
import { ModelsService } from '@/modules/models/models.service';
import { UserEntity } from '@/modules/user/user.entity';
import { BotChannel } from './bot-channel.config';
import { ChannelManagerService } from './channel-manager.service';
import { MediaItem } from './types/bot.types';
import { StreamEmitter } from '@/modules/chat/emitters/stream-emitter.interface';

export interface BotServiceDependencies {
  userEntity: Repository<UserEntity>;
  chatService: ChatService;
  globalConfigService: GlobalConfigService;
  modelsService: ModelsService;
  channelManager: ChannelManagerService;
}

export abstract class BaseBotService implements OnModuleInit, OnModuleDestroy {
  /** userId -> 消息处理队列（串行处理，防止并发冲突） */
  protected messageQueues = new Map<number, Promise<void>>();
  /** userId -> 待处理的媒体缓存 */
  protected pendingMedia = new Map<
    number,
    {
      mediaItems: MediaItem[];
      contextToken?: string;
      fromUserId?: string;
      /** 缓存时所在的那次接收（轮询）的代次；投递前用它确认没有被关闭或重启 */
      generation?: number;
      timer: ReturnType<typeof setTimeout>;
    }
  >();

  protected static readonly MEDIA_CACHE_TIMEOUT = 120000;

  constructor(protected readonly deps: BotServiceDependencies) {}

  abstract get channel(): BotChannel;
  abstract get channelName(): string;
  abstract get featureConfigKey(): string;

  protected abstract findBoundUsers(): Promise<Array<{ id: number; [key: string]: any }>>;
  protected abstract startReceiving(userId: number): Promise<void>;
  protected abstract stopReceiving(userId: number): Promise<void>;
  protected abstract cleanupUserState(userId: number): void;
  protected abstract flushPendingMedia(userId: number): void;

  public async startUser(userId: number): Promise<void> {
    await this.startReceiving(userId);
  }

  public async stopUser(userId: number): Promise<void> {
    await this.stopReceiving(userId);
    this.cleanupUserState(userId);
  }

  async onModuleInit(): Promise<void> {
    const enabled = await this.isFeatureEnabled();
    if (!enabled) return;

    const boundUsers = await this.findBoundUsers();
    let recovered = 0;
    for (const user of boundUsers) {
      try {
        await this.startReceiving(user.id);
        recovered++;
      } catch (error: any) {
        Logger.error(
          `恢复用户 ${user.id} 的${this.channelName}接收失败: ${error.message}`,
          getErrorStack(error),
          this.channelName,
        );
      }
    }
    if (boundUsers.length > 0) {
      Logger.log(`${this.channelName} 服务启动，已恢复 ${recovered} 个用户`, this.channelName);
    }
  }

  onModuleDestroy(): void {
    for (const [, cached] of this.pendingMedia) {
      clearTimeout(cached.timer);
    }
    this.pendingMedia.clear();
    Logger.log(`${this.channelName} 服务已停止`, this.channelName);
  }

  // ---- Message Queue ----

  protected enqueueMessage(userId: number, task: () => Promise<void>): void {
    const queue = this.messageQueues.get(userId) || Promise.resolve();
    const next = queue.then(async () => {
      try {
        await task();
      } catch (error: any) {
        Logger.error(
          `处理用户 ${userId} 的${this.channelName}消息失败: ${error.message}`,
          getErrorStack(error),
          this.channelName,
        );
      }
    });
    this.messageQueues.set(userId, next);
  }

  // ---- Media Caching ----

  protected cacheMediaItems(
    userId: number,
    items: MediaItem[],
    contextToken?: string,
    fromUserId?: string,
    generation?: number,
  ): void {
    let existing = this.pendingMedia.get(userId);
    if (existing && existing.generation !== generation) {
      // 之前那次接收（已停止或已重启）留下的缓存不再投递
      this.clearPendingMedia(userId);
      existing = undefined;
    }
    if (existing) {
      existing.mediaItems.push(...items);
      existing.contextToken = contextToken;
      existing.fromUserId = fromUserId;
      clearTimeout(existing.timer);
      existing.timer = setTimeout(
        () => this.flushPendingMedia(userId),
        BaseBotService.MEDIA_CACHE_TIMEOUT,
      );
    } else {
      this.pendingMedia.set(userId, {
        mediaItems: [...items],
        contextToken,
        fromUserId,
        generation,
        timer: setTimeout(() => this.flushPendingMedia(userId), BaseBotService.MEDIA_CACHE_TIMEOUT),
      });
    }
    Logger.log(
      `用户 ${userId} 缓存${this.channelName}媒体 ${items.length} 个，累计 ${
        this.pendingMedia.get(userId)!.mediaItems.length
      } 个`,
      this.channelName,
    );
  }

  protected clearPendingMedia(userId: number): MediaItem[] | null {
    const cached = this.pendingMedia.get(userId);
    if (!cached) return null;
    clearTimeout(cached.timer);
    this.pendingMedia.delete(userId);
    Logger.log(
      `用户 ${userId} 释放缓存的${this.channelName}媒体 ${cached.mediaItems.length} 个`,
      this.channelName,
    );
    return cached.mediaItems;
  }

  // ---- chatProcess Invocation ----

  protected async invokeChatProcess(
    userId: number,
    prompt: string,
    emitter: StreamEmitter,
    mediaItems?: MediaItem[],
    channelMessageId?: string,
    /** 真正发起对话前的最后一道检查（例如功能已关闭）；返回 false 时不发起 */
    canStart?: () => Promise<boolean>,
  ): Promise<void> {
    const user = await this.deps.userEntity.findOne({
      where: { id: userId },
      select: { id: true, role: true, status: true },
    });
    if (!user) {
      Logger.error(`用户 ${userId} 不存在`, this.channelName);
      return;
    }

    const baseConfig = await this.getChannelModelConfig();

    const chatParams: any = {
      prompt,
      modelId: baseConfig?.modelInfo?.id,
      model: baseConfig?.modelInfo?.model,
      modelName: baseConfig?.modelInfo?.modelName,
    };

    if (mediaItems && mediaItems.length > 0) {
      chatParams.url = JSON.stringify(mediaItems);
    }

    if (channelMessageId) {
      chatParams.channelMessageId = channelMessageId;
    }

    // 查用户与模型期间也可能被关闭：检查之后同步发起，中间没有 await
    if (canStart && !(await canStart())) return;
    await this.deps.chatService.chatProcess(
      chatParams,
      { id: userId, role: user.role },
      emitter,
      (chatId: number) => {
        Logger.debug(`${this.channelName}消息处理已创建 chatId: ${chatId}`, this.channelName);
      },
      this.channel,
    );
  }

  protected getChannelModelConfig(): Promise<any> {
    return this.deps.modelsService.getBaseConfig();
  }

  // ---- Utility ----

  protected async isFeatureEnabled(): Promise<boolean> {
    const config = await this.deps.globalConfigService.getConfigs([this.featureConfigKey]);
    return config === '1';
  }

  protected detectMimeType(buffer: Buffer, category: string, fileName?: string): string {
    if (category === 'image' || category === 'file') {
      if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'image/jpeg';
      if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47)
        return 'image/png';
      if (buffer[0] === 0x47 && buffer[1] === 0x49 && buffer[2] === 0x46) return 'image/gif';
      if (buffer[0] === 0x52 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x46)
        return 'image/webp';
      if (buffer[0] === 0x42 && buffer[1] === 0x4d) return 'image/bmp';
    }
    if (category === 'video') {
      if (buffer[4] === 0x66 && buffer[5] === 0x74 && buffer[6] === 0x79 && buffer[7] === 0x70)
        return 'video/mp4';
      if (buffer[0] === 0x1a && buffer[1] === 0x45 && buffer[2] === 0xdf && buffer[3] === 0xa3)
        return 'video/webm';
      if (buffer[0] === 0x46 && buffer[1] === 0x4c && buffer[2] === 0x56) return 'video/x-flv';
    }
    if (fileName) {
      const ext = fileName.split('.').pop()?.toLowerCase();
      const mimeMap: Record<string, string> = {
        jpg: 'image/jpeg',
        jpeg: 'image/jpeg',
        png: 'image/png',
        gif: 'image/gif',
        webp: 'image/webp',
        bmp: 'image/bmp',
        heic: 'image/heic',
        mp4: 'video/mp4',
        mov: 'video/quicktime',
        avi: 'video/x-msvideo',
        mkv: 'video/x-matroska',
        webm: 'video/webm',
        pdf: 'application/pdf',
        doc: 'application/msword',
        docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        xls: 'application/vnd.ms-excel',
        xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      };
      if (ext && mimeMap[ext]) return mimeMap[ext];
    }
    return category === 'image'
      ? 'image/jpeg'
      : category === 'video'
        ? 'video/mp4'
        : 'application/octet-stream';
  }
}
