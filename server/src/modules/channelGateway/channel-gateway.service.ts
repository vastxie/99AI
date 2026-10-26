import { HttpException, HttpStatus, Inject, Injectable, Logger } from '@nestjs/common';
import { CHANNEL_BINDING_PORT, ChannelBindingPort } from '../channelBinding/channel-binding.port';
import { ChatService } from '../chat/chat.service';
import { ModelsService } from '../models/models.service';
import { UserService } from '../user/user.service';
import { CollectedReply, ReplyCollectorEmitter } from './reply-collector.emitter';

export interface ChannelInboundInput {
  /** 渠道名（由渠道实现登记）；也作为对话记录的 channel */
  channel: string;
  /** 渠道侧用户 id（与 userId 二选一，经渠道绑定解析） */
  channelUserId?: string;
  userId?: number;
  text: string;
  channelMessageId?: string;
  /** 已上传到内核的附件 fileId 列表 */
  fileIds?: string[];
  timeoutMs?: number;
}

export interface ChannelInboundResult extends CollectedReply {
  userId: number;
  timedOut: boolean;
}

const DEFAULT_TIMEOUT_MS = 120_000;
const MAX_TIMEOUT_MS = 300_000;
const LOG_CONTEXT = 'ChannelGateway';

/**
 * 进程外渠道服务的内核入口：以已绑定用户的身份写入一条外部消息，跑完一轮对话后同步返回回复。
 * 渠道服务只需要一个服务端令牌和渠道侧用户 id，不需要知道对话内部结构。
 */
@Injectable()
export class ChannelGatewayService {
  constructor(
    private readonly chatService: ChatService,
    private readonly userService: UserService,
    private readonly modelsService: ModelsService,
    @Inject(CHANNEL_BINDING_PORT) private readonly channelBinding: ChannelBindingPort,
  ) {}

  async resolveBinding(channel: string, channelUserId: string) {
    const normalizedChannel = String(channel || '').trim();
    const normalizedUser = String(channelUserId || '').trim();
    if (!normalizedChannel || !normalizedUser) {
      throw new HttpException('channel 与 channelUserId 不能为空', HttpStatus.BAD_REQUEST);
    }
    return (
      (await this.channelBinding.findUserByChannelUser?.(normalizedChannel, normalizedUser)) ?? null
    );
  }

  async inbound(input: ChannelInboundInput): Promise<ChannelInboundResult> {
    const channel = String(input.channel || '').trim();
    const text = String(input.text || '').trim();
    if (!channel) throw new HttpException('channel 不能为空', HttpStatus.BAD_REQUEST);
    if (!text) throw new HttpException('text 不能为空', HttpStatus.BAD_REQUEST);

    const userId = await this.resolveUserId(input, channel);
    const user = await this.userService.getUserById(userId);
    if (!user) throw new HttpException('用户不存在', HttpStatus.NOT_FOUND);
    if (Number((user as any).status) !== 1 && (user as any).status !== undefined) {
      throw new HttpException('用户已被禁用', HttpStatus.FORBIDDEN);
    }

    const emitter = new ReplyCollectorEmitter();
    const timeoutMs = Math.min(
      Math.max(Number(input.timeoutMs) || DEFAULT_TIMEOUT_MS, 1_000),
      MAX_TIMEOUT_MS,
    );
    // 与站内微信 Bot 一致：使用渠道默认模型，附件以 url 媒体项形式交给 chatProcess
    const baseConfig = await this.modelsService.getBaseConfig().catch((): null => null);
    const rawBody: Record<string, unknown> = {
      prompt: text,
      modelId: baseConfig?.modelInfo?.id,
      model: baseConfig?.modelInfo?.model,
      modelName: baseConfig?.modelInfo?.modelName,
      ...(input.channelMessageId ? { channelMessageId: String(input.channelMessageId) } : {}),
      ...(Array.isArray(input.fileIds) && input.fileIds.length
        ? { url: JSON.stringify(input.fileIds.map(fileId => ({ type: 'file', fileId }))) }
        : {}),
    };
    const actor = { id: user.id, role: (user as any).role || 'user' };

    let timedOut = false;
    let timer: NodeJS.Timeout | undefined;
    const timeout = new Promise<void>(resolve => {
      timer = setTimeout(() => {
        timedOut = true;
        emitter.finish({ code: 'CHANNEL_TIMEOUT', message: `等待回复超过 ${timeoutMs}ms` });
        resolve();
      }, timeoutMs);
    });

    try {
      await Promise.race([
        this.chatService
          .chatProcess(rawBody, actor, emitter, undefined, channel)
          .then(() => emitter.done)
          .catch(error => {
            Logger.warn(
              `[${LOG_CONTEXT}] 渠道 ${channel} 用户 ${userId} 对话失败：${(error as Error)?.message}`,
              LOG_CONTEXT,
            );
            emitter.finish({
              code: (error as any)?.code || 'CHAT_FAILED',
              message: (error as Error)?.message || 'chat failed',
            });
          }),
        timeout,
      ]);
    } finally {
      if (timer) clearTimeout(timer);
    }
    const reply = emitter.finish();
    return { ...reply, userId, timedOut };
  }

  private async resolveUserId(input: ChannelInboundInput, channel: string): Promise<number> {
    const explicit = Number(input.userId);
    if (Number.isInteger(explicit) && explicit > 0) return explicit;
    const channelUserId = String(input.channelUserId || '').trim();
    if (!channelUserId) {
      throw new HttpException('需要 userId 或 channelUserId', HttpStatus.BAD_REQUEST);
    }
    const binding = await this.resolveBinding(channel, channelUserId);
    if (!binding) {
      throw new HttpException('该渠道用户尚未绑定站点账号', HttpStatus.NOT_FOUND);
    }
    return binding.userId;
  }
}
