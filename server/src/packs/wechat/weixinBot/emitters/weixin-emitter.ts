import { getErrorStack } from '@/common/utils/error-stack.util';
import { Logger } from '@nestjs/common';
import {
  AgentEvent,
  answerRoundStart,
  formatQuestionText,
  readPresentedFiles,
  readQuestion,
  type AgentPresentedFile,
  type AgentQuestion,
} from '@99agent/contracts';
import { StreamEmitter } from '@/modules/chat/emitters/stream-emitter.interface';
import { WeixinApiClient } from '../utils/weixin-api-client';
import { uploadMediaToCdn, MediaType } from '../utils/weixin-media';
import { FileAssetService } from '@/modules/fileAsset/fileAsset.service';
import { FILE_ID_PATTERN } from '@/common/constants/id-pattern.constant';

const DEFAULT_WEIXIN_SEND_FILE_LIMIT_MB = 100;

type PendingWeixinMedia = {
  type: 'image' | 'video' | 'file';
  fileId: string;
  name?: string;
  mime?: string;
};

export interface WeixinEmitterOptions {
  toUserId: string;
  /** 上游消息可能不带 context_token；getConfig / sendMessage 均按可选处理 */
  contextToken?: string;
  apiClient: WeixinApiClient;
  ownerUserId?: number;
  fileAssetService?: FileAssetService;
  maxFileSizeMb?: number;
}

/**
 * 微信通道 StreamEmitter 实现
 *
 * 核心职责：
 * 1. 将 AgentEvent 转换为微信消息（过滤工具过程、提取文本）
 * 2. 以 tool.start 为界线拆分消息（冲刷文本缓冲区）：工具执行前的文字作为进度消息发出
 * 3. 从 tool.end 提取媒体，上传到微信 CDN 后发送；有成果清单时只发清单里的文件，按清单顺序
 * 4. 结束时只发回答轮的文字（工具没执行的过程话术不发，例如达到轮次上限），以提问收尾时最后发问题与选项
 * 5. 管理"正在输入"状态
 * 6. 保证消息发送顺序
 */
export class WeixinEmitter implements StreamEmitter {
  /** 还没发出的正文，按轮缓冲 */
  private readonly pendingText = new Map<number, string>();
  /** 已判定为过程轮的轮次（message.phase） */
  private readonly processRounds = new Set<number>();
  private lastRoundIndex = 0;
  /** 生效的成果清单（最后一次成功的选择）与清单文件的元数据 */
  private presentation?: AgentPresentedFile[];
  private readonly presentedMedia = new Map<string, PendingWeixinMedia>();
  /** 以提问收尾时的问题 */
  private question?: AgentQuestion;
  /** typing 状态 */
  private typingActive = false;
  private typingTimer: ReturnType<typeof setInterval> | null = null;
  private typingTicket: string | null = null;
  /** 消息发送 Promise 队列（保证顺序） */
  private sendQueue: Promise<void> = Promise.resolve();
  /** 工具调用结果中收集的待发送媒体 */
  private pendingMedia: PendingWeixinMedia[] = [];
  /** 是否已完成 */
  private finished = false;

  constructor(private readonly options: WeixinEmitterOptions) {
    // 异步获取 typing_ticket（不阻塞 emit）
    this.fetchTypingTicket();
  }

  /** 从 getConfig 获取 typing_ticket */
  private async fetchTypingTicket(): Promise<void> {
    try {
      const config = await this.options.apiClient.getConfig(
        this.options.toUserId,
        this.options.contextToken,
      );
      this.typingTicket = config?.typing_ticket || null;
      if (this.typingTicket) {
        Logger.debug(`获取 typing_ticket 成功`, 'WeixinEmitter');
      }
    } catch (err: any) {
      Logger.debug(`获取 typing_ticket 失败: ${err.message}`, 'WeixinEmitter');
    }
  }

  emit(event: AgentEvent): void {
    if (this.finished && !this.isErrorEvent(event)) return;

    switch (event.type) {
      case 'message.delta':
        this.handleTokenDelta(event);
        break;
      case 'message.phase': {
        const roundIndex = this.roundIndexOf(event);
        if ((event.data as any)?.phase === 'process') this.processRounds.add(roundIndex);
        else this.processRounds.delete(roundIndex);
        break;
      }
      case 'reasoning.delta':
        this.handleThinkingDelta(event);
        break;
      case 'tool.start':
        this.handleToolCall(event);
        break;
      case 'tool.end':
        this.handleToolResult(event);
        break;
      case 'agent.end':
        this.handleDone(event);
        break;
      case 'agent.error':
        this.handleError(event);
        break;
      // snapshot.sync / balance.update / usage.update 等微信通道不需要，忽略
    }
  }

  private isErrorEvent(event: AgentEvent): boolean {
    return event.type === 'agent.error';
  }

  private roundIndexOf(event: AgentEvent): number {
    const parsed = Number(event.roundId ?? 0);
    const roundIndex = Number.isSafeInteger(parsed) && parsed >= 0 && parsed <= 1_000 ? parsed : 0;
    this.lastRoundIndex = Math.max(this.lastRoundIndex, roundIndex);
    return roundIndex;
  }

  /** 处理文本增量 — 按轮缓冲，不立即发送 */
  private handleTokenDelta(event: AgentEvent): void {
    const delta = (event.data as any).delta || '';
    if (delta) {
      const roundIndex = this.roundIndexOf(event);
      this.pendingText.set(roundIndex, (this.pendingText.get(roundIndex) || '') + delta);
      this.startTyping();
    }
  }

  /** 处理思考增量 — 丢弃，但启动 typing */
  private handleThinkingDelta(_event: AgentEvent): void {
    this.startTyping();
  }

  /** 处理工具调用开始 — 冲刷文本缓冲区（以工具为界线拆分消息） */
  private handleToolCall(_event: AgentEvent): void {
    // 工具调用前，先把缓冲的文本作为独立消息发送
    this.flushTextBuffer();
    // 工具执行期间保持 typing
    this.startTyping();
  }

  /** 处理工具调用完成 — 提取 FileAsset 媒体，不发送文本 */
  private handleToolResult(event: AgentEvent): void {
    const data = event.data as any;
    const output = data?.output;
    const media = this.extractFileAssetMedia(
      data?.assets,
      output?.assets,
      output?.files,
      output?.fileAssets,
      output?.attachments,
      data?.files,
      data?.fileAssets,
      data?.attachments,
    );

    const presented = readPresentedFiles(data);
    if (presented) {
      this.presentation = presented;
      for (const item of media) this.presentedMedia.set(item.fileId, item);
    }
    const question = readQuestion(data);
    if (question) this.question = question;

    if (media.length === 0 && !output) {
      this.flushTextBuffer();
      return;
    }

    for (const item of media) {
      this.addPendingMedia(item);
    }

    // 冲刷残留的文本缓冲
    this.flushTextBuffer();
  }

  private addPendingMedia(item: PendingWeixinMedia): void {
    const key = item.fileId;
    if (this.pendingMedia.some(existing => existing.fileId === key)) return;
    this.pendingMedia.push(item);
  }

  private extractFileAssetMedia(...values: any[]): PendingWeixinMedia[] {
    const items = values.flatMap(value => (Array.isArray(value) ? value : value ? [value] : []));
    return items
      .map(item => {
        if (!item || typeof item !== 'object') return null;
        const fileId = this.normalizeFileId(
          item.fileId || item.id || item.file?.fileId || item.asset?.fileId,
        );
        if (!fileId) return null;
        const mime = String(item.mime || item.mimeType || item.contentType || '').toLowerCase();
        const rawType = String(item.type || item.fileType || item.category || '').toLowerCase();
        const type: PendingWeixinMedia['type'] =
          mime.startsWith('image/') || rawType.includes('image')
            ? 'image'
            : mime.startsWith('video/') || rawType.includes('video')
              ? 'video'
              : 'file';
        return {
          type,
          name: item.name || item.title || item.displayName || item.filename || item.fileName,
          fileId,
          mime: item.mime || item.mimeType || item.contentType,
        } as PendingWeixinMedia;
      })
      .filter((item): item is PendingWeixinMedia => Boolean(item));
  }

  private normalizeFileId(value: any): string | undefined {
    if (typeof value !== 'string') return undefined;
    const trimmed = value.trim();
    return FILE_ID_PATTERN.test(trimmed) ? trimmed : undefined;
  }

  /** 处理完成 — 发回答轮的文字 + 成果媒体 + 问题 */
  private handleDone(_event: AgentEvent): void {
    this.flushTextBuffer({ answerOnly: true });
    // 有成果清单时只发清单里的文件（按清单顺序），否则发工具生成的全部媒体
    if (this.presentation) {
      this.pendingMedia = this.presentation
        .map(item => this.presentedMedia.get(item.fileId))
        .filter((item): item is PendingWeixinMedia => Boolean(item));
    }
    this.flushPendingMedia();
    if (this.question) this.enqueueSend(formatQuestionText(this.question));
    this.stopTyping();
    this.finished = true;
  }

  /** 处理错误 — 冲刷回答轮已有的文本（没执行的过程话术不发），发送错误提示 */
  private handleError(event: AgentEvent): void {
    this.flushTextBuffer({ answerOnly: true });
    const data = event.data as any;
    if (data?.message) {
      this.enqueueSend(`抱歉，处理时遇到了问题：${data.message}`);
    }
    this.stopTyping();
    this.finished = true;
  }

  /**
   * 冲刷文本缓冲区到微信消息。answerOnly：只发回答轮的文字（最后一个过程轮之后），
   * 过程轮剩下的文字说明的是没执行的工具，丢弃
   */
  private flushTextBuffer(options: { answerOnly?: boolean } = {}): void {
    const answerStart = options.answerOnly
      ? answerRoundStart(
          Array.from({ length: this.lastRoundIndex + 1 }, (_, roundIndex) => ({
            phase: this.processRounds.has(roundIndex) ? 'process' : undefined,
          })),
        )
      : 0;
    const text = [...this.pendingText.entries()]
      .sort(([left], [right]) => left - right)
      .filter(([roundIndex]) => roundIndex >= answerStart)
      .map(([, value]) => value.trim())
      .filter(Boolean)
      .join('\n\n');
    this.pendingText.clear();
    if (text) this.enqueueSend(text);
  }

  /** 发送工具生成的媒体到微信 */
  private flushPendingMedia(): void {
    if (this.pendingMedia.length === 0) return;

    const items = [...this.pendingMedia];
    this.pendingMedia = [];

    for (const item of items) {
      this.sendQueue = this.sendQueue
        .then(() => this.sendMediaToWeixin(item))
        .catch(err => {
          Logger.error(
            `微信${item.type}发送失败: ${err.message}`,
            getErrorStack(err),
            'WeixinEmitter',
          );
        });
    }
  }

  /**
   * 读取媒体 → 上传到微信 CDN → 发送消息
   */
  private async sendMediaToWeixin(item: PendingWeixinMedia): Promise<void> {
    try {
      const media = await this.readMediaBuffer(item);
      const buffer = media.buffer;
      if (buffer.length === 0) return;

      // 2. 上传到微信 CDN
      const mediaType =
        item.type === 'video'
          ? MediaType.VIDEO
          : item.type === 'file'
            ? MediaType.FILE
            : MediaType.IMAGE;

      const uploaded = await uploadMediaToCdn({
        fileBuffer: buffer,
        toUserId: this.options.toUserId,
        mediaType,
        apiClient: this.options.apiClient,
      });

      // 3. 构建对应类型的消息项
      const cdnMedia = {
        encrypt_query_param: uploaded.downloadEncryptedQueryParam,
        aes_key: Buffer.from(uploaded.aeskeyHex).toString('base64'),
        encrypt_type: 1,
      };

      let mediaItem: any;
      if (item.type === 'image') {
        mediaItem = {
          type: 2,
          image_item: { media: cdnMedia, mid_size: uploaded.fileSizeCiphertext },
        };
      } else if (item.type === 'video') {
        mediaItem = {
          type: 5,
          video_item: { media: cdnMedia, video_size: uploaded.fileSizeCiphertext },
        };
      } else {
        mediaItem = {
          type: 4,
          file_item: {
            media: cdnMedia,
            file_name: item.name || media.filename || 'file',
            len: String(uploaded.fileSize),
          },
        };
      }

      await this.options.apiClient.sendMessage({
        to_user_id: this.options.toUserId,
        context_token: this.options.contextToken,
        item_list: [mediaItem],
      });
      Logger.log(`微信${item.type}发送成功, 大小: ${uploaded.fileSize}`, 'WeixinBotService');
    } catch (err: any) {
      Logger.error(
        `发送${item.type}到微信失败: ${err.message}`,
        getErrorStack(err),
        'WeixinEmitter',
      );
    }
  }

  private async readMediaBuffer(item: PendingWeixinMedia): Promise<{
    buffer: Buffer;
    filename?: string;
    mime?: string;
  }> {
    if (!this.options.fileAssetService || !this.options.ownerUserId) {
      throw new Error('微信文件发送缺少 FileAsset 读取上下文');
    }

    const files = await this.options.fileAssetService.readFilesForRuntime({
      fileIds: [item.fileId],
      userId: this.options.ownerUserId,
      maxFiles: 1,
      maxFileSizeMb: this.resolveMaxFileSizeMb(),
    });
    const file = files[0];
    if (!file) {
      throw new Error('微信文件发送未读取到文件内容');
    }
    return {
      buffer: file.buffer,
      filename: item.name || file.name || file.originalName,
      mime: item.mime || file.mime,
    };
  }

  private resolveMaxFileSizeMb(): number {
    const configured = Number(this.options.maxFileSizeMb);
    if (Number.isFinite(configured) && configured > 0) {
      return configured;
    }
    return DEFAULT_WEIXIN_SEND_FILE_LIMIT_MB;
  }

  /** 按队列顺序发送微信消息 */
  private enqueueSend(text: string): void {
    const chunks = this.splitLongMessage(text, 3000);
    for (const chunk of chunks) {
      this.sendQueue = this.sendQueue
        .then(() => this.sendToWeixin(chunk))
        .catch(err => {
          Logger.error(`微信消息发送失败: ${err.message}`, getErrorStack(err), 'WeixinEmitter');
        });
    }
  }

  /** 拆分过长消息 */
  private splitLongMessage(text: string, maxLength = 3000): string[] {
    if (text.length <= maxLength) return [text];
    const chunks: string[] = [];
    let remaining = text;
    while (remaining.length > 0) {
      if (remaining.length <= maxLength) {
        chunks.push(remaining);
        break;
      }
      // 优先在换行符处拆分
      let splitIndex = remaining.lastIndexOf('\n', maxLength);
      if (splitIndex < maxLength * 0.5) {
        // 如果找不到合适的换行符，尝试在句号处拆分
        splitIndex = remaining.lastIndexOf('。', maxLength);
        if (splitIndex < maxLength * 0.5) {
          splitIndex = remaining.lastIndexOf('.', maxLength);
        }
        if (splitIndex < maxLength * 0.5) {
          splitIndex = maxLength;
        }
      }
      chunks.push(remaining.substring(0, splitIndex).trim());
      remaining = remaining.substring(splitIndex).trim();
    }
    return chunks;
  }

  /** 实际发送微信消息 */
  private async sendToWeixin(text: string): Promise<void> {
    await this.options.apiClient.sendMessage({
      to_user_id: this.options.toUserId,
      context_token: this.options.contextToken,
      item_list: [{ type: 1, text_item: { text } }],
    });
    Logger.log(`微信消息发送成功, 长度: ${text.length}`, 'WeixinBotService');
  }

  /** 开始"正在输入"状态 */
  private startTyping(): void {
    if (this.typingActive) return;
    this.typingActive = true;
    if (this.typingTicket) {
      this.sendTypingStatus(1);
      // 每 5 秒续一次
      this.typingTimer = setInterval(() => {
        if (this.typingActive && this.typingTicket) {
          this.sendTypingStatus(1);
        }
      }, 5000);
    }
  }

  /** 停止"正在输入"状态 */
  private stopTyping(): void {
    if (!this.typingActive) return;
    this.typingActive = false;
    if (this.typingTimer) {
      clearInterval(this.typingTimer);
      this.typingTimer = null;
    }
    if (this.typingTicket) {
      this.sendTypingStatus(2);
    }
  }

  private sendTypingStatus(status: number): void {
    if (!this.typingTicket) return;
    void this.options.apiClient
      .sendTyping({
        ilink_user_id: this.options.toUserId,
        typing_ticket: this.typingTicket,
        status,
      })
      .catch(err => {
        Logger.debug(`发送微信typing状态失败: ${err?.message || '未知错误'}`, 'WeixinEmitter');
      });
  }
}
