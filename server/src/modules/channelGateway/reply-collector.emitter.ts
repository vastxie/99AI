import {
  findPresentedFiles,
  projectReplyText,
  type AgentEvent,
  type AgentReplyToolCallLike,
} from '@99agent/contracts';
import { FILE_ID_PATTERN } from '@/common/constants/id-pattern.constant';
import type { StreamEmitter } from '../chat/emitters/stream-emitter.interface';

export interface CollectedReplyFile {
  fileId: string;
  displayName?: string;
  mimeType?: string;
  size?: number;
  role?: string;
}

export interface CollectedReply {
  text: string;
  files: CollectedReplyFile[];
  chatId?: number | string;
  error?: { code?: string; message: string };
}

interface CollectedRound {
  text: string;
  phase?: 'process';
  toolCalls: AgentReplyToolCallLike[];
}

/**
 * 把一轮对话的事件流收敛成一条回复（文本 + 产物文件），供进程外渠道服务同步取回。
 * agent.end / agent.error 到达时 done 解析；不做任何传输，只收集。
 *
 * 正文按轮缓冲：过程话术（process 轮）不算回复，阶段可能在文字之后才到或被校正，所以收尾时才选；
 * 终态快照给出的 content（回答 + 以提问收尾时的问题）优先。有成果清单时只回清单里的文件，按清单顺序。
 */
export class ReplyCollectorEmitter implements StreamEmitter {
  private readonly rounds: CollectedRound[] = [];
  /** 终态快照给出的回复文字 */
  private finalText?: string;
  private readonly files = new Map<string, CollectedReplyFile>();
  private chatId?: number | string;
  private error?: CollectedReply['error'];
  private finished = false;
  private resolveDone!: (reply: CollectedReply) => void;
  readonly done: Promise<CollectedReply>;

  constructor() {
    this.done = new Promise(resolve => {
      this.resolveDone = resolve;
    });
  }

  emit(event: AgentEvent): void {
    if (this.finished) return;
    if (event.chatId !== undefined && this.chatId === undefined) this.chatId = event.chatId as any;
    const data = (event as any).data || {};
    switch (event.type) {
      case 'message.delta': {
        const delta = typeof data.delta === 'string' ? data.delta : '';
        if (delta) this.roundOf(event).text += delta;
        break;
      }
      case 'message.end': {
        const round = this.roundOf(event);
        if (!round.text && typeof data.content === 'string') round.text = data.content;
        break;
      }
      case 'message.phase': {
        const round = this.roundOf(event);
        if (data.phase === 'process') round.phase = 'process';
        else delete round.phase;
        break;
      }
      case 'tool.end':
        this.collectFiles(data);
        this.roundOf(event).toolCalls.push({
          type: data.type,
          status: data.status,
          display: data.display,
        });
        break;
      case 'snapshot.sync':
        if (
          (data.reason === 'workflow_complete' || data.finishReason) &&
          typeof data.content === 'string'
        ) {
          this.finalText = data.content;
        }
        break;
      case 'agent.error':
        this.error = { code: data.code, message: data.message || 'agent error' };
        this.finish();
        break;
      case 'agent.end':
        this.finish();
        break;
      default:
        break;
    }
  }

  /** 超时或调用方异常时强制收敛 */
  finish(error?: CollectedReply['error']): CollectedReply {
    if (this.finished) return this.snapshot();
    if (error && !this.error) this.error = error;
    this.finished = true;
    const reply = this.snapshot();
    this.resolveDone(reply);
    return reply;
  }

  private roundOf(event: AgentEvent): CollectedRound {
    const parsed = Number(event.roundId ?? 0);
    const index = Number.isSafeInteger(parsed) && parsed >= 0 && parsed <= 1_000 ? parsed : 0;
    while (this.rounds.length <= index) this.rounds.push({ text: '', toolCalls: [] });
    return this.rounds[index];
  }

  private snapshot(): CollectedReply {
    const presented = findPresentedFiles({ rounds: this.rounds });
    const files = presented
      ? presented
          .map(item => this.files.get(item.fileId))
          .filter((file): file is CollectedReplyFile => Boolean(file))
      : [...this.files.values()];
    return {
      text: this.finalText ?? projectReplyText({ rounds: this.rounds }),
      files,
      ...(this.chatId !== undefined ? { chatId: this.chatId } : {}),
      ...(this.error ? { error: this.error } : {}),
    };
  }

  private collectFiles(data: any): void {
    const candidates: any[] = [];
    for (const list of [
      data?.assets,
      data?.display?.files,
      data?.output?.files,
      data?.output?.assets,
      data?.files,
    ]) {
      if (Array.isArray(list)) candidates.push(...list);
    }
    for (const item of candidates) {
      const fileId = String(item?.fileId || item?.id || '').trim();
      if (!FILE_ID_PATTERN.test(fileId) || this.files.has(fileId)) continue;
      if (item?.role && item.role !== 'final' && item.role !== 'preview') continue;
      this.files.set(fileId, {
        fileId,
        displayName: item.displayName || item.name || item.title,
        mimeType: item.mimeType || item.mime,
        size: typeof item.size === 'number' ? item.size : undefined,
        role: item.role,
      });
    }
  }
}
