import type {
  AgentKernelEventDataMap,
  AgentLifecycleEventData,
  ToolLifecycleEventData,
} from './agent-events';
import type {
  AgentEventEnvelope,
  AgentFinishReason,
  AgentSnapshotMessageWire,
  AgentTurnWireState,
} from './envelope';
import type { PlatformEventDataMap, SnapshotSyncEventData } from './platform-events';
import { projectAnswerText, type AgentRoundPhase } from './agent-reply';

type ReducerEventDataMap = AgentKernelEventDataMap & PlatformEventDataMap;

export type AgentEventReducerEvent = {
  [K in keyof ReducerEventDataMap]: AgentEventEnvelope & {
    type: K;
    data: ReducerEventDataMap[K];
  };
}[keyof ReducerEventDataMap];

export interface AgentEventReducedToolCall {
  id: string;
  name: string;
  toolName?: string;
  displayName?: string;
  status: 'loading' | 'success' | 'error';
  arguments: Record<string, never>;
  inputSummary?: string;
  type?: string;
  outputHint?: unknown;
  progress?: ToolLifecycleEventData['progress'];
  display?: ToolLifecycleEventData['display'];
  assets?: ToolLifecycleEventData['assets'];
  output?: unknown;
  duration?: number;
  error?: ToolLifecycleEventData['error'];
}

export interface AgentEventReducedRound {
  text: string | null;
  thinking: string | null;
  toolCalls: AgentEventReducedToolCall[];
  completed: boolean;
  /** 这一轮调用了工具，文字是过程话术（见 agent-reply） */
  phase?: AgentRoundPhase;
}

export interface AgentEventReducerState {
  workflowSeq: number;
  requiresSnapshot: boolean;
  chatId: string;
  messageId?: string;
  turnId?: string;
  /** 回答文字：由轮次与 phase 归约（projectAnswerText）；快照给出的 content 原样采用 */
  content: string;
  thinking: string;
  rounds: AgentEventReducedRound[];
  model?: string;
  timestamp?: string;
  turn?: AgentTurnWireState;
  status?: string | number | null;
  finishReason?: AgentFinishReason;
  terminal: boolean;
  usage?: {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
  };
}

export type AgentEventReductionDisposition = 'applied' | 'ignored' | 'gap';

export interface AgentEventReductionResult {
  disposition: AgentEventReductionDisposition;
  state: AgentEventReducerState;
}

function clonePublicValue(value: unknown, depth = 0): unknown {
  if (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  ) {
    return value;
  }
  if (depth >= 12) return null;
  if (Array.isArray(value)) {
    return value.slice(0, 128).map((item) => clonePublicValue(item, depth + 1));
  }
  if (!value || typeof value !== 'object') return null;
  const result: Record<string, unknown> = {};
  for (const [key, nested] of Object.entries(value).slice(0, 128)) {
    if (nested !== undefined) result[key] = clonePublicValue(nested, depth + 1);
  }
  return result;
}

function cloneTurn(turn: AgentTurnWireState | undefined): AgentTurnWireState | undefined {
  return turn ? { ...turn } : undefined;
}

function emptyRound(): AgentEventReducedRound {
  return { text: null, thinking: null, toolCalls: [], completed: false };
}

function roundIndexOf(event: AgentEventReducerEvent): number {
  return explicitRoundIndexOf(event) ?? 0;
}

/** 事件明确给出的合法轮次号；缺失或非法时为 undefined */
function explicitRoundIndexOf(event: AgentEventReducerEvent): number | undefined {
  if (event.roundId === undefined || event.roundId === null || String(event.roundId) === '') {
    return undefined;
  }
  const parsed = Number(event.roundId);
  return Number.isSafeInteger(parsed) && parsed >= 0 && parsed <= 1_000 ? parsed : undefined;
}

function cloneRounds(rounds: readonly AgentEventReducedRound[]): AgentEventReducedRound[] {
  return rounds.map((round) => ({
    ...round,
    toolCalls: round.toolCalls.map((toolCall) => ({
      ...toolCall,
      arguments: {},
      ...(toolCall.outputHint === undefined
        ? {}
        : { outputHint: clonePublicValue(toolCall.outputHint) }),
      ...(toolCall.progress === undefined
        ? {}
        : {
            progress: clonePublicValue(toolCall.progress) as ToolLifecycleEventData['progress'],
          }),
      ...(toolCall.display === undefined
        ? {}
        : {
            display: clonePublicValue(toolCall.display) as ToolLifecycleEventData['display'],
          }),
      ...(toolCall.assets === undefined
        ? {}
        : {
            assets: clonePublicValue(toolCall.assets) as ToolLifecycleEventData['assets'],
          }),
      ...(toolCall.output === undefined ? {} : { output: clonePublicValue(toolCall.output) }),
      ...(toolCall.error === undefined
        ? {}
        : {
            error: clonePublicValue(toolCall.error) as ToolLifecycleEventData['error'],
          }),
    })),
  }));
}

function normalizeToolStatus(value: unknown): AgentEventReducedToolCall['status'] {
  const status = String(value || '').toLowerCase();
  if (status === 'success') return 'success';
  if (status === 'error' || status === 'skipped') return 'error';
  return 'loading';
}

function normalizeSnapshotToolCall(value: unknown): AgentEventReducedToolCall | null {
  if (!value || typeof value !== 'object') return null;
  const tool = value as Record<string, unknown>;
  const id = String(tool.id || '').trim();
  if (!id) return null;
  const name = String(tool.name || tool.displayName || tool.toolName || 'tool');
  const normalizedOutput = outputWithAssets({
    ...(tool.output === undefined ? {} : { output: tool.output }),
    ...(Array.isArray(tool.assets)
      ? { assets: tool.assets as ToolLifecycleEventData['assets'] }
      : {}),
  });
  return {
    id,
    name,
    ...(tool.toolName ? { toolName: String(tool.toolName) } : {}),
    ...(tool.displayName ? { displayName: String(tool.displayName) } : {}),
    status: normalizeToolStatus(tool.status),
    arguments: {},
    ...(tool.inputSummary ? { inputSummary: String(tool.inputSummary) } : {}),
    ...(tool.type ? { type: String(tool.type) } : {}),
    ...(tool.outputHint === undefined ? {} : { outputHint: clonePublicValue(tool.outputHint) }),
    ...(tool.progress === undefined
      ? {}
      : {
          progress: clonePublicValue(tool.progress) as ToolLifecycleEventData['progress'],
        }),
    ...(tool.display === undefined
      ? {}
      : {
          display: clonePublicValue(tool.display) as ToolLifecycleEventData['display'],
        }),
    ...(tool.assets === undefined
      ? {}
      : {
          assets: clonePublicValue(tool.assets) as ToolLifecycleEventData['assets'],
        }),
    ...(normalizedOutput === undefined ? {} : { output: normalizedOutput }),
    ...(Number.isFinite(Number(tool.duration))
      ? { duration: Math.max(0, Number(tool.duration)) }
      : {}),
    ...(tool.error === undefined
      ? {}
      : {
          error: clonePublicValue(tool.error) as ToolLifecycleEventData['error'],
        }),
  };
}

function parseSnapshotMessage(value: unknown): {
  message?: AgentSnapshotMessageWire;
  rounds: AgentEventReducedRound[];
} {
  let parsed = value;
  if (typeof value === 'string') {
    try {
      parsed = JSON.parse(value);
    } catch {
      return { rounds: [] };
    }
  }
  if (!parsed || typeof parsed !== 'object') return { rounds: [] };
  const message = parsed as AgentSnapshotMessageWire;
  const rawRounds = Array.isArray(message.rounds) ? message.rounds : [];
  const rounds = rawRounds.slice(0, 1_001).map((rawRound) => {
    const round =
      rawRound && typeof rawRound === 'object' ? (rawRound as Record<string, unknown>) : {};
    return {
      text: typeof round.text === 'string' ? round.text : null,
      thinking: typeof round.thinking === 'string' ? round.thinking : null,
      toolCalls: Array.isArray(round.toolCalls)
        ? round.toolCalls
            .map((toolCall) => normalizeSnapshotToolCall(toolCall))
            .filter((toolCall): toolCall is AgentEventReducedToolCall => Boolean(toolCall))
        : [],
      completed: Boolean(round.completed),
      ...(round.phase === 'process' ? { phase: 'process' as const } : {}),
    };
  });
  return { message, rounds };
}

function ensureRound(rounds: AgentEventReducedRound[], roundIndex: number): AgentEventReducedRound {
  while (rounds.length <= roundIndex) rounds.push(emptyRound());
  return rounds[roundIndex];
}

function outputWithAssets(data: ToolLifecycleEventData): unknown {
  const outputValue = data.output === undefined ? undefined : clonePublicValue(data.output);
  const output =
    outputValue && typeof outputValue === 'object' && !Array.isArray(outputValue)
      ? (outputValue as Record<string, unknown>)
      : undefined;
  const assets = Array.isArray(data.assets) ? data.assets : [];
  if (assets.length === 0) return outputValue;
  const files = assets.map((asset) => ({
    type: String(asset.mimeType || '').startsWith('image/')
      ? 'image'
      : String(asset.mimeType || '').startsWith('video/')
        ? 'video'
        : String(asset.mimeType || '').startsWith('audio/')
          ? 'audio'
          : 'file',
    id: asset.fileId,
    fileId: asset.fileId,
    title: asset.displayName,
    role: asset.role,
    ...(asset.mimeType ? { mime: asset.mimeType, mimeType: asset.mimeType } : {}),
    ...(asset.size === undefined ? {} : { size: asset.size }),
    visibility: 'private',
    privateDownloadHidden: true,
    privatePreviewHidden: true,
  }));
  return {
    ...(output || (outputValue === undefined ? {} : { value: outputValue })),
    files: output && Array.isArray(output.files) && output.files.length > 0 ? output.files : files,
  };
}

function reduceToolEvent(
  state: AgentEventReducerState,
  event: Extract<AgentEventReducerEvent, { type: 'tool.start' | 'tool.update' | 'tool.end' }>,
): AgentEventReducerState {
  const callId = String(event.toolCallId || '').trim();
  if (!callId) return state;
  const rounds = cloneRounds(state.rounds);
  const round = ensureRound(rounds, roundIndexOf(event));
  const existingIndex = round.toolCalls.findIndex((toolCall) => toolCall.id === callId);
  const existing = existingIndex >= 0 ? round.toolCalls[existingIndex] : undefined;
  const data = event.data;
  const next: AgentEventReducedToolCall = {
    id: callId,
    name: String(data.displayName || data.name || existing?.name || 'tool'),
    ...(data.name || existing?.toolName
      ? { toolName: String(data.name || existing?.toolName) }
      : {}),
    ...(data.displayName || existing?.displayName
      ? { displayName: String(data.displayName || existing?.displayName) }
      : {}),
    status:
      event.type === 'tool.end'
        ? normalizeToolStatus(data.status || 'success')
        : normalizeToolStatus(data.status || existing?.status),
    arguments: {},
    ...(data.inputSummary || existing?.inputSummary
      ? { inputSummary: String(data.inputSummary || existing?.inputSummary) }
      : {}),
    ...(data.type || existing?.type ? { type: String(data.type || existing?.type) } : {}),
    ...(data.outputHint === undefined && existing?.outputHint === undefined
      ? {}
      : {
          outputHint: clonePublicValue(data.outputHint ?? existing?.outputHint),
        }),
    ...(data.progress === undefined && existing?.progress === undefined
      ? {}
      : {
          progress: clonePublicValue(
            data.progress ?? existing?.progress,
          ) as ToolLifecycleEventData['progress'],
        }),
    ...(data.display === undefined && existing?.display === undefined
      ? {}
      : {
          display: clonePublicValue(
            data.display ?? existing?.display,
          ) as ToolLifecycleEventData['display'],
        }),
    ...(data.assets === undefined && existing?.assets === undefined
      ? {}
      : {
          assets: clonePublicValue(
            data.assets ?? existing?.assets,
          ) as ToolLifecycleEventData['assets'],
        }),
    ...(data.output === undefined && data.assets === undefined && existing?.output === undefined
      ? {}
      : {
          output: outputWithAssets(data) ?? clonePublicValue(existing?.output),
        }),
    ...(data.durationMs === undefined && existing?.duration === undefined
      ? {}
      : {
          duration: Math.max(0, Number(data.durationMs ?? existing?.duration) || 0),
        }),
    ...(data.error === undefined && existing?.error === undefined
      ? {}
      : {
          error: clonePublicValue(data.error ?? existing?.error) as ToolLifecycleEventData['error'],
        }),
  };
  if (existingIndex >= 0) round.toolCalls[existingIndex] = next;
  else round.toolCalls.push(next);
  return { ...state, rounds };
}

function terminalStatusFromFinishReason(reason: AgentFinishReason): string {
  if (reason === 'abort') return 'interrupted';
  if (reason === 'error') return 'failed';
  return 'completed';
}

function isTerminalStatus(value: unknown): boolean {
  const normalized = String(value ?? '')
    .trim()
    .toLowerCase();
  return [
    '3',
    '4',
    '5',
    'completed',
    'failed',
    'stopped',
    'interrupted',
    'abort',
    'aborted',
    'error',
  ].includes(normalized);
}

function applySnapshot(
  state: AgentEventReducerState,
  event: Extract<AgentEventReducerEvent, { type: 'snapshot.sync' }>,
): AgentEventReducerState {
  const data = event.data;
  const parsed = parseSnapshotMessage(data.message);
  const message = parsed.message;
  const rounds = parsed.rounds;
  const thinking =
    data.thinking !== undefined
      ? String(data.thinking)
      : rounds.map((round) => round.thinking || '').join('');
  const turn = cloneTurn(data.turn || message?.turn);
  const status = data.status ?? data.turnStatus ?? turn?.status;
  const terminal =
    Boolean(data.finishReason) || (data.reason === 'resync' && isTerminalStatus(status));
  // 终态快照的 content 是服务端定稿的回复（回答 + 以提问收尾时的问题），原样采用；
  // 运行中的快照带着轮次时按轮次与阶段重算回答，与增量归约一致
  const content =
    !terminal && message
      ? projectAnswerText(rounds)
      : data.content !== undefined
        ? String(data.content)
        : typeof message?.content === 'string'
          ? message.content
          : '';
  const inferredFinishReason: AgentFinishReason | undefined = data.finishReason
    ? data.finishReason
    : terminal
      ? String(status).toLowerCase() === 'failed' || String(status) === '4'
        ? 'error'
        : ['stopped', 'interrupted', 'abort', 'aborted', '5'].includes(String(status).toLowerCase())
          ? 'abort'
          : 'stop'
      : undefined;
  return {
    workflowSeq: state.workflowSeq,
    requiresSnapshot: state.requiresSnapshot,
    chatId: String(event.chatId || state.chatId),
    ...(event.messageId || state.messageId
      ? { messageId: String(event.messageId || state.messageId) }
      : {}),
    ...(event.turnId || turn?.id
      ? { turnId: String(event.turnId || turn?.id) }
      : state.turnId
        ? { turnId: state.turnId }
        : {}),
    content,
    thinking,
    rounds,
    ...(message?.model ? { model: message.model } : {}),
    ...(message?.timestamp ? { timestamp: message.timestamp } : {}),
    ...(turn ? { turn } : {}),
    ...(status === undefined ? {} : { status }),
    ...(inferredFinishReason ? { finishReason: inferredFinishReason } : {}),
    terminal,
    ...(data.usage ? { usage: { ...data.usage } } : {}),
  };
}

function applyEvent(
  state: AgentEventReducerState,
  event: AgentEventReducerEvent,
): AgentEventReducerState {
  if (event.type === 'snapshot.sync') return applySnapshot(state, event);

  let next: AgentEventReducerState = {
    ...state,
    chatId: String(event.chatId || state.chatId),
    ...(event.messageId ? { messageId: String(event.messageId) } : {}),
    ...(event.turnId ? { turnId: String(event.turnId) } : {}),
  };

  if (event.type === 'message.delta' && event.data.delta) {
    const rounds = cloneRounds(next.rounds);
    const round = ensureRound(rounds, roundIndexOf(event));
    round.text = `${round.text || ''}${event.data.delta}`;
    next = { ...next, content: projectAnswerText(rounds), rounds };
  } else if (event.type === 'message.end') {
    const rounds = cloneRounds(next.rounds);
    const round = ensureRound(rounds, roundIndexOf(event));
    round.completed = true;
    if (typeof event.data.content === 'string') {
      round.text = event.data.content;
      next = { ...next, content: projectAnswerText(rounds), rounds };
    } else {
      next = { ...next, rounds };
    }
  } else if (event.type === 'message.phase') {
    // 阶段只对指明的那一轮生效：没有合法轮次号的事件不猜，忽略
    const roundIndex = explicitRoundIndexOf(event);
    if (roundIndex !== undefined) {
      const rounds = cloneRounds(next.rounds);
      const round = ensureRound(rounds, roundIndex);
      if (event.data.phase === 'process') round.phase = 'process';
      else delete round.phase;
      next = { ...next, content: projectAnswerText(rounds), rounds };
    }
  } else if (event.type === 'reasoning.delta' && event.data.delta) {
    const rounds = cloneRounds(next.rounds);
    const round = ensureRound(rounds, roundIndexOf(event));
    round.thinking = `${round.thinking || ''}${event.data.delta}`;
    next = { ...next, thinking: `${next.thinking}${event.data.delta}`, rounds };
  } else if (
    event.type === 'tool.start' ||
    event.type === 'tool.update' ||
    event.type === 'tool.end'
  ) {
    next = reduceToolEvent(next, event);
  } else if (event.type === 'usage.update') {
    next = { ...next, usage: { ...event.data } };
  }

  if (
    event.type === 'agent.start' ||
    event.type === 'agent.end' ||
    event.type === 'turn.start' ||
    event.type === 'turn.end' ||
    event.type === 'agent.error'
  ) {
    const data = event.data as AgentLifecycleEventData;
    const turn = cloneTurn(data.turn);
    if (turn) {
      next = {
        ...next,
        turn,
        turnId: String(event.turnId || turn.id),
        status: turn.status,
      };
    }
  }

  if (event.type === 'turn.end' && event.data.finishReason) {
    next = { ...next, finishReason: event.data.finishReason };
  }

  if (event.type === 'agent.end') {
    const finishReason = event.data.finishReason || 'stop';
    next = {
      ...next,
      finishReason,
      status:
        event.data.turnStatus ||
        event.data.turn?.status ||
        terminalStatusFromFinishReason(finishReason),
      terminal: true,
    };
  } else if (event.type === 'agent.error') {
    const status = event.data.turnStatus || event.data.turn?.status;
    next = {
      ...next,
      ...(status ? { status } : {}),
      ...(isTerminalStatus(status) ? { finishReason: 'error' as const, terminal: true } : {}),
    };
  }

  return next;
}

function workflowSeqOf(event: AgentEventReducerEvent): number {
  const parsed = Number(event.workflowSeq ?? event.seq);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : 0;
}

export function createAgentEventReducerState(
  initial: Partial<AgentEventReducerState> = {},
): AgentEventReducerState {
  return {
    workflowSeq: Math.max(0, Number(initial.workflowSeq) || 0),
    requiresSnapshot: Boolean(initial.requiresSnapshot),
    chatId: String(initial.chatId || ''),
    ...(initial.messageId ? { messageId: String(initial.messageId) } : {}),
    ...(initial.turnId ? { turnId: String(initial.turnId) } : {}),
    content: String(initial.content || ''),
    thinking: String(initial.thinking || ''),
    rounds: cloneRounds(initial.rounds || []),
    ...(initial.model ? { model: String(initial.model) } : {}),
    ...(initial.timestamp ? { timestamp: String(initial.timestamp) } : {}),
    ...(initial.turn ? { turn: cloneTurn(initial.turn)! } : {}),
    ...(initial.status === undefined ? {} : { status: initial.status }),
    ...(initial.finishReason ? { finishReason: initial.finishReason } : {}),
    terminal: Boolean(initial.terminal),
    ...(initial.usage ? { usage: { ...initial.usage } } : {}),
  };
}

/**
 * Zero-dependency reference reducer for the public Agent Event Wire.
 * Ordinary sequenced events are accepted only contiguously. A gap freezes
 * incremental application until an authoritative snapshot establishes a new barrier.
 */
export function reduceAgentEvent(
  current: AgentEventReducerState,
  event: AgentEventReducerEvent,
): AgentEventReductionResult {
  const state = createAgentEventReducerState(current);
  const seq = workflowSeqOf(event);

  if (event.type === 'snapshot.sync') {
    if (seq > 0 && seq < state.workflowSeq) {
      return { disposition: 'ignored', state };
    }
    const next = applySnapshot(state, event);
    return {
      disposition: 'applied',
      state: {
        ...next,
        workflowSeq: seq > 0 ? seq : state.workflowSeq,
        requiresSnapshot: false,
      },
    };
  }

  if (state.requiresSnapshot) return { disposition: 'gap', state };
  if (seq > 0) {
    if (seq <= state.workflowSeq) return { disposition: 'ignored', state };
    const expected = state.workflowSeq + 1;
    if (seq !== expected) {
      return {
        disposition: 'gap',
        state: { ...state, requiresSnapshot: true },
      };
    }
  }
  if (state.terminal) {
    return {
      disposition: 'ignored',
      state: seq > 0 ? { ...state, workflowSeq: seq } : state,
    };
  }

  return {
    disposition: 'applied',
    state: {
      ...applyEvent(state, event),
      workflowSeq: seq > 0 ? seq : state.workflowSeq,
    },
  };
}

export function toAgentSnapshotMessage(state: AgentEventReducerState): AgentSnapshotMessageWire {
  return {
    role: 'assistant',
    content: state.content,
    rounds: cloneRounds(state.rounds),
    ...(state.model ? { model: state.model } : {}),
    ...(state.timestamp ? { timestamp: state.timestamp } : {}),
    ...(state.turn ? { turn: cloneTurn(state.turn) } : {}),
  };
}

export function toSnapshotSyncEventData(
  state: AgentEventReducerState,
  reason: SnapshotSyncEventData['reason'] = 'resync',
): SnapshotSyncEventData {
  return {
    reason,
    content: state.content,
    thinking: state.thinking,
    message: toAgentSnapshotMessage(state),
    ...(state.status === undefined ? {} : { status: state.status }),
    ...(state.turn ? { turn: cloneTurn(state.turn), turnStatus: state.turn.status } : {}),
    ...(state.usage ? { usage: { ...state.usage } } : {}),
    ...(state.finishReason ? { finishReason: state.finishReason } : {}),
  };
}
