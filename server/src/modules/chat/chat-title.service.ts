import { Injectable, Logger, Optional } from '@nestjs/common';
import { ChatGroupService } from '../chatGroup/chatGroup.service';
import { ChatLogService } from '../chatLog/chatLog.service';
import { ModelsService } from '../models/models.service';
import { ModelGatewayService } from '../modelGateway/model-gateway.service';
import { createOpaqueModelGatewaySessionId } from '../modelGateway/model-gateway-session';
import { ChatLiveSyncService } from '../chatRealtime/chat-live-sync.service';

const CHAT_TITLE_PROMPT_LIMIT = 1200;
const CHAT_TITLE_TIMEOUT_MS = 8000;

/**
 * 对话自动命名域服务：首条用户消息后用 AI 生成会话标题，
 * 含回声标题判定与规则回退。从 ChatService 整体迁出。
 */
@Injectable()
export class ChatTitleService {
  constructor(
    private readonly chatLogService: ChatLogService,
    private readonly modelsService: ModelsService,
    @Optional() private readonly modelGatewayService?: ModelGatewayService,
    @Optional() private readonly chatGroupService?: ChatGroupService,
    @Optional() private readonly chatLiveSyncService?: ChatLiveSyncService,
  ) {}

  private resolveModelGatewayConfigForTitle(model: any) {
    if (!model) return null;
    return this.modelsService.resolveModelGatewayConfig(model);
  }

  private normalizeTitleForComparison(value: unknown): string {
    return String(value || '')
      .toLowerCase()
      .replace(/https?:\/\/\S+/gi, '')
      .replace(/[\s#*_~>|\[\]{}()<>"'“”‘’\\，。！？!?、：:；;,.`-]+/g, '')
      .trim();
  }

  private isEchoLikeTitle(title: unknown, prompt: unknown): boolean {
    const normalizedTitle = this.normalizeTitleForComparison(title);
    const normalizedPrompt = this.normalizeTitleForComparison(prompt);
    if (!normalizedTitle || !normalizedPrompt) return false;
    if (normalizedTitle === normalizedPrompt) return true;

    if (normalizedPrompt.length <= 24) {
      return (
        normalizedPrompt.includes(normalizedTitle) || normalizedTitle.includes(normalizedPrompt)
      );
    }

    return (
      normalizedTitle.length >= 8 &&
      normalizedPrompt.startsWith(normalizedTitle) &&
      normalizedTitle.length / normalizedPrompt.length > 0.7
    );
  }

  private async generateChatTitleWithAI(
    prompt: string,
    model: any,
    groupId: number,
  ): Promise<string> {
    if (!this.modelGatewayService) return '';
    const modelGatewayConfig = this.resolveModelGatewayConfigForTitle(model);
    if (!modelGatewayConfig?.apiKey || !modelGatewayConfig?.model) return '';

    const text = String(prompt || '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, CHAT_TITLE_PROMPT_LIMIT);
    if (!text) return '';

    const abortController = new AbortController();
    const timeout = setTimeout(() => abortController.abort(), CHAT_TITLE_TIMEOUT_MS);
    try {
      const completion = await this.modelGatewayService.completeOnce({
        config: modelGatewayConfig,
        messages: [
          {
            role: 'system',
            content:
              '你是对话标题生成器。请根据用户第一条消息归纳会话主题，只输出标题本身。标题要抽象概括用户意图，不要直接照抄或复读原句；问候寒暄统一概括为“问候与开场”；数学题统一概括到具体题型或“数学题求解”。标题不超过18个汉字，不要引号、解释或多余文本。',
          },
          {
            role: 'user',
            content: text,
          },
        ],
        maxTokens: 64,
        stream: false,
        signal: abortController.signal,
        purpose: 'chat_title',
        sessionId: createOpaqueModelGatewaySessionId(`group:${groupId}`),
        // 标题是小任务：由网关按协议/模型适配禁思考参数，content 不含思考文本
        disableThinking: true,
      });

      const aiTitle = String(completion.content || '').trim();
      if (!aiTitle) {
        // 推理模型把预算耗在思考上时 content 为空，记录以避免静默退化难排查
        Logger.warn('会话标题生成返回空内容，已回退规则标题', 'ChatService');
        return '';
      }
      if (aiTitle === '新对话') return '';
      if (this.isEchoLikeTitle(aiTitle, text)) return '';

      const normalizedTitle = this.chatGroupService?.buildRuleBasedTitleFromMessage(aiTitle) || '';
      if (this.isEchoLikeTitle(normalizedTitle, text)) return '';
      return normalizedTitle;
    } finally {
      clearTimeout(timeout);
    }
  }

  private async applyAutoTitleForFirstUserMessage(input: {
    groupId: number;
    userLogId: number;
    user: any;
    prompt: string;
    model: any;
  }) {
    if (!this.chatGroupService) {
      return;
    }

    const firstInboundLogId = await this.chatLogService.findFirstInboundChatLogIdForGroup(
      input.groupId,
    );
    if (firstInboundLogId !== input.userLogId) return;

    const fallbackTitle = this.chatGroupService.buildRuleBasedTitleFromMessage(input.prompt);
    let title = fallbackTitle;
    try {
      title =
        (await this.generateChatTitleWithAI(input.prompt, input.model, input.groupId)) ||
        fallbackTitle;
    } catch {
      Logger.warn('会话标题 AI 生成失败，已使用规则标题', 'ChatService');
    }

    const updatedConversation = await this.chatGroupService.updateDefaultTitleByGroupId(
      input.groupId,
      input.user,
      title,
    );
    if (updatedConversation && typeof updatedConversation === 'object' && updatedConversation.gid) {
      this.chatLiveSyncService?.emitToUser(input.user?.id, {
        type: 'conversation_updated',
        channel: updatedConversation.channel || 'web',
        conversationGid: updatedConversation.gid,
        conversation: updatedConversation,
      });
    }
  }

  scheduleAutoTitleForFirstUserMessage(input: {
    groupId?: number | null;
    userLogId?: number | null;
    user: any;
    prompt: string;
    model: any;
  }) {
    const groupId = Math.floor(Number(input.groupId) || 0);
    const userLogId = Math.floor(Number(input.userLogId) || 0);
    if (!groupId || !userLogId) return;

    void this.applyAutoTitleForFirstUserMessage({
      groupId,
      userLogId,
      user: input.user,
      prompt: input.prompt,
      model: input.model,
    }).catch(() => {
      Logger.warn('会话自动命名失败，已跳过本次标题更新', 'ChatService');
    });
  }
}
