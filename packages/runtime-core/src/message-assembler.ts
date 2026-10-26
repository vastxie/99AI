import type {
  AgentRuntimeModelMessage,
  AgentRuntimePorts,
  AgentRuntimeToolCall,
  AgentRuntimeToolDefinition,
} from './contracts';

type ToolCallChunk = { id: string; name: string; arguments: string };

export const INTERRUPTED_TOOL_RESULT_CONTENT =
  '工具调用记录不完整：该调用已中断，结果未知。不要把它视为成功。';

export interface AgentRuntimeMessageGroup {
  kind: 'system' | 'turn' | 'tool_sequence' | 'message';
  messages: AgentRuntimeModelMessage[];
  estimatedTokens: number;
  /** Explicitly required by the platform (system/checkpoint/current input). */
  required: boolean;
  /** The newest user request; everything after it belongs to the active turn. */
  newestUserTurn?: boolean;
}

export interface AgentRuntimeContextProjection {
  messages: AgentRuntimeModelMessage[];
  keptGroups: AgentRuntimeMessageGroup[];
  droppedGroups: AgentRuntimeMessageGroup[];
  estimatedTokens: number;
  overBudgetRequired: boolean;
}

function stringifyForTokenEstimate(value: unknown): string {
  if (typeof value === 'string') return value;
  if (value === undefined || value === null) return '';
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

export function estimateAgentRuntimeTokens(value: unknown): number {
  const text = stringifyForTokenEstimate(value);
  return text ? Math.max(1, Math.ceil(text.length / 4)) : 0;
}

function estimateMessageGroupTokens(messages: AgentRuntimeModelMessage[]): number {
  return messages.reduce(
    (total, message) =>
      total +
      estimateAgentRuntimeTokens({
        role: message.role,
        content: message.content,
        reasoning_content: message.reasoning_content,
        tool_calls: message.tool_calls,
        tool_call_id: message.tool_call_id,
        name: message.name,
      }),
    0,
  );
}

/**
 * Groups history at legal context cut points. Every assistant tool call keeps
 * all of its contiguous results. The newest user request and every message
 * after it are part of the active turn and are never silently dropped.
 */
export function groupAgentRuntimeMessages(
  messages: AgentRuntimeModelMessage[],
): AgentRuntimeMessageGroup[] {
  const groups: AgentRuntimeMessageGroup[] = [];
  let index = 0;
  while (index < messages.length) {
    const message = messages[index];
    if (message.role === 'system') {
      groups.push({
        kind: 'system',
        messages: [message],
        estimatedTokens: estimateMessageGroupTokens([message]),
        required: true,
      });
      index += 1;
      continue;
    }

    if (message.role === 'user') {
      groups.push({
        kind: 'turn',
        messages: [message],
        estimatedTokens: estimateMessageGroupTokens([message]),
        required: (message as any).__agent_context?.required === true,
      });
      index += 1;
      continue;
    }

    if (message.role === 'assistant' && message.tool_calls?.length) {
      const toolSequence: AgentRuntimeModelMessage[] = [message];
      index += 1;
      while (index < messages.length && messages[index].role === 'tool') {
        toolSequence.push(messages[index]);
        index += 1;
      }
      groups.push({
        kind: 'tool_sequence',
        messages: toolSequence,
        estimatedTokens: estimateMessageGroupTokens(toolSequence),
        required: toolSequence.some((item) => (item as any).__agent_context?.required === true),
      });
      continue;
    }

    groups.push({
      kind: 'message',
      messages: [message],
      estimatedTokens: estimateMessageGroupTokens([message]),
      required: (message as any).__agent_context?.required === true,
    });
    index += 1;
  }

  let activeTurnStart = -1;
  for (let groupIndex = groups.length - 1; groupIndex >= 0; groupIndex -= 1) {
    if (
      groups[groupIndex].kind === 'turn' &&
      !(groups[groupIndex].messages[0] as any).__agent_context?.checkpoint
    ) {
      groups[groupIndex].newestUserTurn = true;
      activeTurnStart = groupIndex;
      break;
    }
  }
  if (activeTurnStart >= 0) {
    for (let groupIndex = activeTurnStart + 1; groupIndex < groups.length; groupIndex += 1) {
      groups[groupIndex].newestUserTurn = true;
    }
  }
  return groups;
}

export function projectAgentRuntimeMessages(input: {
  messages: AgentRuntimeModelMessage[];
  maxTokens: number;
  tokenScale?: number;
  requireNewestUserTurn?: boolean;
}): AgentRuntimeContextProjection {
  const maxTokens = Math.max(1, Math.floor(Number(input.maxTokens) || 1));
  const tokenScale = Math.max(0.25, Math.min(8, Number(input.tokenScale) || 1));
  const groups = groupAgentRuntimeMessages(input.messages).map((group) => ({
    ...group,
    required:
      group.kind === 'system' ||
      group.required ||
      (input.requireNewestUserTurn !== false && group.newestUserTurn === true),
    estimatedTokens: Math.max(1, Math.ceil(group.estimatedTokens * tokenScale)),
  }));
  const kept = new Set(groups);
  let total = groups.reduce((sum, group) => sum + group.estimatedTokens, 0);

  for (const group of groups) {
    if (total <= maxTokens) break;
    if (group.required) continue;
    kept.delete(group);
    total -= group.estimatedTokens;
  }

  const keptGroups = groups.filter((group) => kept.has(group));
  const droppedGroups = groups.filter((group) => !kept.has(group));
  return {
    messages: keptGroups.flatMap((group) => group.messages),
    keptGroups,
    droppedGroups,
    estimatedTokens: total,
    overBudgetRequired: total > maxTokens,
  };
}

/** @experimental */
export class AgentRuntimeContextPolicy {
  static estimateTokens(value: unknown): number {
    return estimateAgentRuntimeTokens(value);
  }

  static group(messages: AgentRuntimeModelMessage[]): AgentRuntimeMessageGroup[] {
    return groupAgentRuntimeMessages(messages);
  }

  static project(input: {
    messages: AgentRuntimeModelMessage[];
    maxTokens: number;
    tokenScale?: number;
    requireNewestUserTurn?: boolean;
  }): AgentRuntimeContextProjection {
    return projectAgentRuntimeMessages(input);
  }
}

export function sanitizeToolName(name: string): string {
  if (/^[a-zA-Z_][a-zA-Z0-9_-]*$/.test(name)) return name;
  let sanitized = name.replace(/[^a-zA-Z0-9_-]/g, '_');
  if (!/^[a-zA-Z_]/.test(sanitized)) sanitized = `_${sanitized}`;
  return sanitized.substring(0, 128);
}

/** @experimental */
export function sanitizeToolDefinitions(tools: AgentRuntimeToolDefinition[]): {
  sanitized: AgentRuntimeToolDefinition[];
  nameMap: Map<string, string>;
} {
  const nameMap = new Map<string, string>();
  const usedNames = new Set<string>();
  const sanitized = tools.map((tool) => {
    const originalName = tool.function.name;
    let cleanName = sanitizeToolName(originalName);
    if (usedNames.has(cleanName)) {
      let suffix = 2;
      while (usedNames.has(`${cleanName}_${suffix}`)) suffix += 1;
      cleanName = `${cleanName}_${suffix}`;
    }
    usedNames.add(cleanName);
    nameMap.set(cleanName, originalName);
    return { ...tool, function: { ...tool.function, name: cleanName } };
  });
  return { sanitized, nameMap };
}

export class MessageAssembler {
  sanitizeMessageSequence(messages: AgentRuntimeModelMessage[]): void {
    for (let index = 0; index < messages.length; index += 1) {
      const message = messages[index];
      if (message.role !== 'assistant' || !message.tool_calls?.length) continue;
      const expectedIds = new Set(message.tool_calls.map((call) => call.id));
      const foundIds = new Set<string>();
      let insertIndex = index + 1;
      for (let nextIndex = index + 1; nextIndex < messages.length; nextIndex += 1) {
        const next = messages[nextIndex];
        if (next.role !== 'tool') break;
        if (next.tool_call_id) foundIds.add(next.tool_call_id);
        insertIndex = nextIndex + 1;
      }
      const missingIds = [...expectedIds].filter((id) => !foundIds.has(id));
      if (missingIds.length > 0) {
        messages.splice(
          insertIndex,
          0,
          ...missingIds.map((toolCallId) => ({
            role: 'tool' as const,
            tool_call_id: toolCallId,
            content: INTERRUPTED_TOOL_RESULT_CONTENT,
          })),
        );
      }
    }

    const allowedToolIndexes = new Set<number>();
    for (let index = 0; index < messages.length; index += 1) {
      const message = messages[index];
      if (message.role !== 'assistant' || !message.tool_calls?.length) continue;
      const expectedIds = new Set(message.tool_calls.map((call) => call.id));
      const consumedIds = new Set<string>();
      for (let nextIndex = index + 1; nextIndex < messages.length; nextIndex += 1) {
        const next = messages[nextIndex];
        if (next.role !== 'tool') break;
        if (
          next.tool_call_id &&
          expectedIds.has(next.tool_call_id) &&
          !consumedIds.has(next.tool_call_id)
        ) {
          allowedToolIndexes.add(nextIndex);
          consumedIds.add(next.tool_call_id);
        }
      }
    }
    for (let index = messages.length - 1; index >= 0; index -= 1) {
      if (messages[index].role === 'tool' && !allowedToolIndexes.has(index)) {
        messages.splice(index, 1);
      }
    }
  }

  sanitizeApiMessageNames(messages: AgentRuntimeModelMessage[]): void {
    for (const message of messages) {
      if (message.name && !/^[a-zA-Z0-9_-]+$/.test(message.name)) {
        message.name = sanitizeToolName(message.name);
      }
      for (const call of message.tool_calls || []) {
        if (!/^[a-zA-Z0-9_-]+$/.test(call.function.name)) {
          call.function.name = sanitizeToolName(call.function.name);
        }
      }
    }
  }

  assembleToolCalls(
    chunks: Map<number, ToolCallChunk>,
    clock: AgentRuntimePorts['clock'],
  ): { toolCalls: AgentRuntimeToolCall[]; malformed: boolean } {
    const toolCalls: AgentRuntimeToolCall[] = [];
    let malformed = false;
    for (const index of [...chunks.keys()].sort((left, right) => left - right)) {
      const chunk = chunks.get(index)!;
      if (!chunk.name) {
        if (chunk.id || chunk.arguments) malformed = true;
        continue;
      }
      toolCalls.push({
        id: chunk.id || clock.nextId(`call_${index}`),
        type: 'function',
        function: { name: chunk.name, arguments: chunk.arguments },
      });
    }
    return { toolCalls, malformed };
  }
}
