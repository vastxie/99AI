import { randomBytes } from 'crypto';
import {
  AgentRunTrace,
  AgentRoundTrace,
  ModelMessage,
  UnifiedMessage,
} from '../../chatLog/types/message.types';
import type { AgentToolCallTrace, ToolResultOutputKind } from '../../chatLog/tool-result-payload';
import type { AgentLoopOptions } from '../core/agent-loop.service';
import { sanitizeTraceText } from './trace-sanitizer';

const TRACE_INPUT_SUMMARY_LIMIT = 500;
const TRACE_OUTPUT_SUMMARY_LIMIT = 1000;
const TRACE_ERROR_SUMMARY_LIMIT = 500;
const TRACE_FILE_REF_LIMIT = 20;
const TRACE_OUTPUT_KINDS = new Set<ToolResultOutputKind>([
  'search',
  'web_read',
  'runtime',
  'file_parse',
  'media_generate',
  'generic',
]);

function createTraceId(): string {
  return `trace_${Date.now().toString(36)}_${randomBytes(4).toString('hex')}`;
}

function normalizeTraceOutputKind(value: unknown): ToolResultOutputKind | undefined {
  const normalized = String(value || '')
    .trim()
    .toLowerCase();
  return TRACE_OUTPUT_KINDS.has(normalized as ToolResultOutputKind)
    ? (normalized as ToolResultOutputKind)
    : undefined;
}

export class AgentTraceHarness {
  ensureRunTrace(options: AgentLoopOptions, model?: string): AgentRunTrace {
    const message = options.currentMessage!;
    const messageId = String(options.messageId || options.chatId || '').trim();
    if (!message.trace) {
      message.trace = {
        traceId: createTraceId(),
        ...(messageId ? { cid: messageId, messageId } : {}),
        ...(options.turnId ? { turnId: options.turnId } : {}),
        ...(options.userId !== undefined && options.userId !== null
          ? { userUid: String(options.userId) }
          : {}),
        ...(model ? { model } : {}),
        startedAt: new Date().toISOString(),
        status: 'running',
        rounds: [],
      };
    } else if (model && !message.trace.model) {
      message.trace.model = model;
    }
    return message.trace;
  }

  summarizeModelInput(messages: ModelMessage[], tools: any[]): string {
    const recentRoles = messages
      .slice(-6)
      .map(message => message.role)
      .join(',');
    return `messages=${messages.length}; recentRoles=${recentRoles}; tools=${tools.length}`;
  }

  summarizeModelOutput(content: string): string | undefined {
    const length = String(content || '').trim().length;
    return length > 0 ? `assistantTextChars=${length}` : undefined;
  }

  createRoundTrace(roundIndex: number, messages: ModelMessage[], tools: any[]): AgentRoundTrace {
    return {
      roundIndex,
      startedAt: new Date().toISOString(),
      status: 'success',
      modelInputSummary: sanitizeTraceText(
        this.summarizeModelInput(messages, tools),
        TRACE_INPUT_SUMMARY_LIMIT,
      ),
      toolCalls: [],
    };
  }

  finalizeRunTrace(
    message: UnifiedMessage | undefined,
    options: AgentLoopOptions,
    status: AgentRunTrace['status'],
  ): void {
    if (!message?.trace) return;
    const endedAt = new Date().toISOString();
    const rounds = message.trace.rounds || [];
    const currentRound = rounds[rounds.length - 1];
    for (const round of rounds) {
      if (round.endedAt) {
        if (round === currentRound && round.status === 'success') {
          if (status === 'error') {
            round.status = 'error';
          } else if (status === 'aborted') {
            round.status = 'skipped';
          }
        }
        continue;
      }
      round.endedAt = endedAt;
      if (status === 'error') {
        round.status = 'error';
      } else if (status === 'aborted') {
        round.status = 'skipped';
      }
    }
    this.updateTraceSummary(message.trace, options, status);
  }

  buildToolTrace(toolResult: any): AgentToolCallTrace {
    const traceOutput =
      normalizeTraceOutputKind(
        toolResult?.model?.output?.kind || toolResult?.display?.kind || toolResult?.output?.kind,
      ) || 'generic';
    const fileRefs = Array.isArray(toolResult?.internal?.fileRefs?.entries)
      ? toolResult.internal.fileRefs.entries
          .map((entry: any) => sanitizeTraceText(entry?.fileRef, 96))
          .filter(Boolean)
          .slice(0, TRACE_FILE_REF_LIMIT)
      : [];
    const status = toolResult?.status === 'error' ? 'error' : 'success';
    const outputSummary = sanitizeTraceText(
      toolResult?.display?.publicError ||
        toolResult?.display?.summary ||
        toolResult?.output?.publicError ||
        toolResult?.output?.summary ||
        toolResult?.model?.content,
      TRACE_OUTPUT_SUMMARY_LIMIT,
    );
    const errorMessage =
      status === 'error'
        ? sanitizeTraceText(
            toolResult?.display?.publicError ||
              toolResult?.output?.publicError ||
              toolResult?.display?.error ||
              toolResult?.output?.error,
            TRACE_ERROR_SUMMARY_LIMIT,
          )
        : undefined;
    const durationMs = Number(toolResult?.duration);
    const elapsedMs = Number.isFinite(durationMs) && durationMs >= 0 ? durationMs : 0;
    return {
      callId: sanitizeTraceText(toolResult?.id || `tool_${Date.now()}`, 160) || 'tool',
      toolName:
        sanitizeTraceText(toolResult?.toolName || toolResult?.name || 'tool', 160) || 'tool',
      output: { kind: traceOutput },
      ...(toolResult?.inputSummary
        ? { inputSummary: sanitizeTraceText(toolResult.inputSummary, TRACE_INPUT_SUMMARY_LIMIT) }
        : {}),
      ...(outputSummary ? { outputSummary } : {}),
      fileRefs: fileRefs as string[],
      durationMs: elapsedMs,
      status,
      ...(status === 'error' ? { errorCode: 'TOOL_EXECUTION_ERROR' } : {}),
      ...(errorMessage ? { errorSummary: errorMessage, errorMessage } : {}),
    };
  }

  withToolTrace(toolResult: any): any {
    const trace = this.buildToolTrace(toolResult);
    return {
      ...toolResult,
      internal: {
        ...(toolResult?.internal || {}),
        trace,
      },
    };
  }

  private updateTraceSummary(
    trace: AgentRunTrace,
    options: AgentLoopOptions,
    status: AgentRunTrace['status'],
  ): void {
    const endedAt = new Date();
    trace.endedAt = endedAt.toISOString();
    trace.status = status;
    const startedAt = Date.parse(trace.startedAt);
    const totalDurationMs = Number.isFinite(startedAt)
      ? Math.max(0, endedAt.getTime() - startedAt)
      : 0;
    const toolCallCount = trace.rounds.reduce(
      (count, round) => count + (round.toolCalls?.length || 0),
      0,
    );
    trace.summary = {
      roundCount: trace.rounds.length,
      toolCallCount,
      totalDurationMs,
      ...(options.tokenUsage?.totalTokens ? { totalTokens: options.tokenUsage.totalTokens } : {}),
      ...(options.toolCost !== undefined ? { toolCost: options.toolCost } : {}),
    };
  }
}

export { sanitizeTraceText };
