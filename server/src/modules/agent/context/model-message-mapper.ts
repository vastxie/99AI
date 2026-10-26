import type { ModelMessage } from '../../chatLog/types/message.types';
import type { AgentContextBlock, AgentContextBuildResult } from './agent-context.types';
import { AGENT_CONTEXT_BLOCK_ORDER } from './agent-context.types';

const USER_CONTEXT_LABELS: Record<string, string> = {
  platform_policy: '运行时上下文',
  explicit_file_reference: '明确文件引用',
  queued_turn: '接续消息',
  previous_tool_result: '上一轮工具结果',
};

function cloneMessage(message: ModelMessage): ModelMessage {
  return JSON.parse(JSON.stringify(message));
}

function blockOrder(block: AgentContextBlock): number {
  const index = AGENT_CONTEXT_BLOCK_ORDER.indexOf(block.type);
  return index >= 0 ? index : 999;
}

function contentToText(content: AgentContextBlock['content']): string {
  if (typeof content === 'string') return content.trim();
  if (!Array.isArray(content)) return '';
  try {
    return JSON.stringify(content);
  } catch {
    return String(content || '');
  }
}

function appendToLastUserMessage(messages: ModelMessage[], text: string): boolean {
  if (!text) return false;
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const message = messages[i];
    if (message.role !== 'user') continue;
    if (typeof message.content === 'string') {
      message.content = `${message.content || ''}\n\n${text}`.trim();
      return true;
    }
    if (Array.isArray(message.content)) {
      const textPart = message.content.find(
        (part: any) => part?.type === 'text' && typeof part.text === 'string',
      ) as any;
      if (textPart) {
        textPart.text = `${textPart.text || ''}\n\n${text}`.trim();
      } else {
        message.content.unshift({ type: 'text', text });
      }
      return true;
    }
    message.content = text;
    return true;
  }
  return false;
}

function formatUserContextBlock(block: AgentContextBlock): string {
  const content = contentToText(block.content);
  if (!content) return '';
  const label = USER_CONTEXT_LABELS[block.type] || block.metadata?.label || block.type;
  if (content.startsWith('[')) return content;
  return `[${label}]\n${content}`;
}

export class ModelMessageMapper {
  toModelMessages(input: AgentContextBuildResult | AgentContextBlock[]): ModelMessage[] {
    const blocks = Array.isArray(input) ? input : input.blocks;
    const included = blocks.filter(block => block.included !== false);
    const messages: ModelMessage[] = [];

    this.appendMessagesForBlockType(messages, included, 'system_identity');
    this.appendMessagesForBlockType(messages, included, 'recent_history');
    this.appendMessagesForBlockType(messages, included, 'current_user_request');

    const userContextBlocks = included
      .filter(block => block.metadata?.injectAs === 'user_context')
      .sort((a, b) => blockOrder(a) - blockOrder(b));

    for (const block of userContextBlocks) {
      const contextText = formatUserContextBlock(block);
      if (!contextText) continue;
      if (!appendToLastUserMessage(messages, contextText)) {
        messages.push({ role: 'user', content: contextText });
      }
    }

    const sequenceBlocks = included
      .filter(block => block.metadata?.injectAs === 'message_sequence')
      .filter(block => block.type !== 'system_identity')
      .filter(block => block.type !== 'recent_history')
      .filter(block => block.type !== 'current_user_request')
      .sort((a, b) => blockOrder(a) - blockOrder(b));

    for (const block of sequenceBlocks) {
      const blockMessages = block.metadata?.modelMessages;
      if (blockMessages?.length) {
        messages.push(...blockMessages.map(cloneMessage));
      }
    }

    return messages;
  }

  private appendMessagesForBlockType(
    messages: ModelMessage[],
    blocks: AgentContextBlock[],
    type: AgentContextBlock['type'],
  ): void {
    for (const block of blocks.filter(item => item.type === type)) {
      const blockMessages = block.metadata?.modelMessages;
      if (blockMessages?.length) {
        messages.push(...blockMessages.map(cloneMessage));
        continue;
      }
      const text = contentToText(block.content);
      if (!text) continue;
      messages.push({ role: type === 'system_identity' ? 'system' : 'user', content: text });
    }
  }
}
