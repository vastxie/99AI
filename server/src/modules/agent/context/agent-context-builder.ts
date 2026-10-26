import { REDACTED_TEXT } from '@/common/constants/redaction.constant';
import type { ModelMessage } from '../../chatLog/types/message.types';
import { getToolModelContent } from '../../chatLog/tool-result-payload';
import type { FileRefEntry, FileRefMapping } from '../../fileAsset/file-refs';
import {
  AGENT_CONTEXT_BLOCK_PRIORITY,
  AgentContextBlock,
  AgentContextBlockType,
  AgentContextBuilderInput,
  AgentContextQueuedTurnInput,
  AgentContextTextInput,
} from './agent-context.types';
import { AgentContextTransformer } from './agent-context-transformer';

function cloneMessage(message: ModelMessage): ModelMessage {
  return JSON.parse(JSON.stringify(message));
}

function stringifyMessageContent(content: ModelMessage['content']): string {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  return content
    .map((part: any) => {
      if (part?.type === 'text') return part.text || '';
      if (part?.type === 'image_url' || part?.type === 'image_file') return '[图片]';
      if (part?.type === 'video_url' || part?.type === 'video_file') return '[视频]';
      if (part?.type === 'input_audio' || part?.type === 'audio_file') return '[音频]';
      if (part?.type === 'document_file' || part?.type === 'document') return '[文档]';
      return `[${part?.type || 'part'}]`;
    })
    .filter(Boolean)
    .join(' ');
}

function asTextInput(value?: string | AgentContextTextInput): AgentContextTextInput | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value === 'string') return { content: value };
  return value;
}

function compactWhitespace(value: string): string {
  return String(value || '')
    .replace(/[ \t]+\n/g, '\n')
    .trim();
}

function isCheckpointMessage(message: ModelMessage): boolean {
  return (message as any).__agent_context?.checkpoint === true;
}

function isExplicitCurrentUserMessage(message: ModelMessage): boolean {
  return (
    message.role === 'user' &&
    !isCheckpointMessage(message) &&
    (message as any).__agent_context?.required === true
  );
}

function sanitizeReferenceValue(value: unknown): string {
  const text = compactWhitespace(String(value || ''));
  if (!text) return '';
  if (
    /(?:^|[\\/])(?:Users|private|var|Volumes)(?:[\\/]|$)/i.test(text) ||
    /^[A-Za-z]:\\Users\\/i.test(text)
  ) {
    return text.split(/[\\/]/).filter(Boolean).pop() || REDACTED_TEXT;
  }
  return text
    .replace(
      /\b(?:api[_\s-]?key|authorization|bearer|token|secret|password|base[_\s-]?url)\s*[:=]\s*[^\s,;，。)）]+/gi,
      REDACTED_TEXT,
    )
    .slice(0, 160);
}

interface FileReferenceFormatResult {
  hasEntries: boolean;
  text: string;
  alreadyPresent: boolean;
}

export class AgentContextBuilder {
  constructor(private readonly transformer = new AgentContextTransformer()) {}

  build(input: AgentContextBuilderInput) {
    const blocks: AgentContextBlock[] = [];
    const messages = (input.messages || []).map(cloneMessage);
    let counter = 0;
    const nextId = (type: AgentContextBlockType) => `ctx_${type}_${++counter}`;

    const pushBlock = (
      type: AgentContextBlockType,
      content: string | unknown[],
      params: Partial<AgentContextBlock> = {},
    ) => {
      const normalizedContent = typeof content === 'string' ? compactWhitespace(content) : content;
      const hasContent =
        Array.isArray(normalizedContent) ||
        (typeof normalizedContent === 'string' && normalizedContent.length > 0);
      if (!hasContent && !params.warnings?.length) return;

      blocks.push({
        id: params.id || nextId(type),
        type,
        priority: params.priority || AGENT_CONTEXT_BLOCK_PRIORITY[type],
        tokenBudget: params.tokenBudget,
        content: normalizedContent,
        visibility: params.visibility || 'model_only',
        source: params.source,
        included: params.included,
        reason: params.reason,
        warnings: params.warnings,
        metadata: params.metadata,
      });
    };

    const systemMessages = messages.filter(message => message.role === 'system');
    const nonSystemMessages = messages.filter(message => message.role !== 'system');
    const explicitCurrentUserIndexes = nonSystemMessages.flatMap((message, index) =>
      isExplicitCurrentUserMessage(message) ? [index] : [],
    );
    if (explicitCurrentUserIndexes.length > 1) {
      throw new Error('Agent context contains multiple current user requests');
    }
    const fallbackCurrentUserIndex = (() => {
      for (let i = nonSystemMessages.length - 1; i >= 0; i -= 1) {
        if (nonSystemMessages[i].role === 'user' && !isCheckpointMessage(nonSystemMessages[i])) {
          return i;
        }
      }
      return -1;
    })();
    const currentUserIndex = explicitCurrentUserIndexes[0] ?? fallbackCurrentUserIndex;
    if (
      explicitCurrentUserIndexes.length === 1 &&
      nonSystemMessages
        .slice(currentUserIndex + 1)
        .some(message => message.role === 'user' && !isCheckpointMessage(message))
    ) {
      throw new Error('Agent context contains a historical user request after the current request');
    }
    const currentUserMessage =
      currentUserIndex >= 0 ? cloneMessage(nonSystemMessages[currentUserIndex]) : undefined;
    const currentUserMessageText = currentUserMessage
      ? stringifyMessageContent(currentUserMessage.content)
      : '';
    const historyMessages = nonSystemMessages
      .filter((_message, index) => index !== currentUserIndex)
      .map(cloneMessage);

    if (systemMessages.length) {
      const content = systemMessages
        .map(message => stringifyMessageContent(message.content))
        .filter(Boolean)
        .join('\n\n');
      pushBlock('system_identity', content, {
        source: { module: 'chat', id: 'system' },
        metadata: {
          modelMessages: [
            {
              role: 'system',
              content,
            },
          ],
          injectAs: 'system',
          label: 'System Identity',
        },
      });
    }

    const platformPolicy = asTextInput(input.platformPolicy);
    if (platformPolicy?.content || platformPolicy?.warning) {
      pushBlock('platform_policy', platformPolicy.content || '', {
        source: { module: 'chat', id: platformPolicy.sourceId || 'runtime-context' },
        metadata: { injectAs: 'user_context', label: 'Platform Policy' },
        warnings: platformPolicy.warning ? [platformPolicy.warning] : undefined,
        included: Boolean(platformPolicy.content),
        reason: platformPolicy.content ? undefined : 'degraded_unavailable',
      });
    }

    if (currentUserMessage) {
      pushBlock('current_user_request', currentUserMessageText, {
        source: { module: 'chat', id: 'current-user-request' },
        metadata: {
          modelMessages: [currentUserMessage],
          injectAs: 'message_sequence',
          label: 'Current User Request',
        },
      });
    }

    const fileReferences = this.formatFileReferences(input.fileRefMapping, currentUserMessageText);
    if (fileReferences.hasEntries) {
      pushBlock(
        'explicit_file_reference',
        fileReferences.text || '用户明确引用的文件已在当前请求中标注。',
        {
          source: { module: 'file-ref-mapping', id: 'file-refs' },
          metadata: {
            injectAs: fileReferences.text ? 'user_context' : 'manifest_only',
            label: 'Explicit File References',
          },
          reason: fileReferences.alreadyPresent
            ? 'already_present_in_current_user_request'
            : undefined,
        },
      );
    }

    const queuedTurnText = this.formatQueuedTurn(input.queuedTurn);
    if (queuedTurnText) {
      pushBlock('queued_turn', queuedTurnText, {
        source: { module: 'conversation-turn-queue', id: input.queuedTurn?.parentTurnId },
        metadata: { injectAs: 'user_context', label: 'Queued Turn' },
      });
    }

    if (historyMessages.length) {
      pushBlock('recent_history', this.summarizeMessages(historyMessages), {
        source: { module: 'chat-log', id: 'recent-history' },
        metadata: {
          modelMessages: historyMessages,
          injectAs: 'message_sequence',
          label: 'Recent History',
        },
      });
    }

    const previousToolResultText = this.formatPreviousToolResults(input.previousToolResults);
    if (previousToolResultText) {
      pushBlock('previous_tool_result', previousToolResultText, {
        source: { module: 'agent-tool-result', id: 'previous-tool-results' },
        metadata: { injectAs: 'user_context', label: 'Previous Tool Results' },
      });
    } else {
      const historicalToolMessages = historyMessages.filter(message => message.role === 'tool');
      if (historicalToolMessages.length) {
        pushBlock('previous_tool_result', this.summarizeMessages(historicalToolMessages), {
          source: { module: 'chat-log', id: 'historical-tool-results' },
          metadata: { injectAs: 'manifest_only', label: 'Previous Tool Results' },
        });
      }
    }

    return this.transformer.transform(blocks, {
      maxTokens: input.maxTokens,
      recentHistoryTokenBudget: input.recentHistoryTokenBudget,
    });
  }

  private summarizeMessages(messages: ModelMessage[]): string {
    return messages
      .map(message => `${message.role}: ${stringifyMessageContent(message.content)}`.trim())
      .filter(Boolean)
      .join('\n');
  }

  private formatFileReferences(
    mapping?: FileRefMapping,
    existingText = '',
  ): FileReferenceFormatResult {
    const entries = Array.isArray(mapping?.entries) ? mapping.entries : [];
    const missingEntries = entries.filter(
      entry => !existingText.includes(`fileRef=${entry.fileRef}`),
    );
    const lines = missingEntries.map((entry: FileRefEntry) => {
      const parts = [
        `fileRef=${entry.fileRef}`,
        entry.name ? `name=${sanitizeReferenceValue(entry.name)}` : '',
        entry.type ? `type=${sanitizeReferenceValue(entry.type)}` : '',
        entry.mime ? `mime=${sanitizeReferenceValue(entry.mime)}` : '',
        Number.isFinite(Number(entry.size)) ? `size=${entry.size}` : '',
        entry.role ? `role=${sanitizeReferenceValue(entry.role)}` : '',
      ].filter(Boolean);
      return `- ${parts.join(' | ')}`;
    });
    return {
      hasEntries: entries.length > 0,
      text: lines.length ? ['用户明确引用的文件：', ...lines].join('\n') : '',
      alreadyPresent: entries.length > 0 && missingEntries.length === 0,
    };
  }

  private formatQueuedTurn(turn?: AgentContextQueuedTurnInput | null): string {
    if (!turn) return '';
    const lines = ['[接续消息]'];
    if (turn.prompt) lines.push(`用户追加请求：${turn.prompt}`);
    return lines.length > 1 ? lines.join('\n') : '';
  }

  private formatPreviousToolResults(results?: unknown[]): string {
    if (!Array.isArray(results) || results.length === 0) return '';
    const lines = results
      .slice(-6)
      .map((result, index) => {
        if ((result as any)?.role === 'tool') {
          return `${index + 1}. ${String((result as any).content || '').trim()}`;
        }
        return `${index + 1}. ${getToolModelContent(result)}`;
      })
      .filter(line => line.trim().length > 3);
    return lines.length ? ['上一轮工具结果摘要：', ...lines].join('\n') : '';
  }
}
