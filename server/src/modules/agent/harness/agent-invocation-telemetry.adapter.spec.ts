import { Logger } from '@nestjs/common';
import {
  AgentInvocationTelemetryAdapter,
  sanitizeAgentInvocationTelemetryEvent,
} from './agent-invocation-telemetry.adapter';

declare const afterEach: any;
declare const describe: any;
declare const expect: any;
declare const it: any;
declare const jest: any;

describe('AgentInvocationTelemetryAdapter', () => {
  afterEach(() => jest.restoreAllMocks());

  it('rebuilds events from a fixed low-sensitivity allowlist', () => {
    const safe = sanitizeAgentInvocationTelemetryEvent({
      type: 'invocation.completed',
      invocation: {
        operationId: 'op_turn_safe_1',
        turnId: 'turn_safe_1',
        generation: 3,
        invocationId: 'op_turn_safe_1:g3:model:0',
        parentInvocationId: 'op_turn_safe_1:g3:run',
        traceId: 'trace_safe_1',
      },
      phase: 'model',
      status: 'unknown',
      atMs: 10,
      durationMs: 4,
      roundIndex: 1,
      attemptIndex: 2,
      messageCount: 7,
      toolCount: 3,
      inputTokens: 11,
      outputTokens: 5,
      totalTokens: 16,
      category: 'transient',
      code: 'MODEL_OUTCOME_UNKNOWN',
      prompt: 'SECRET_PROMPT',
      reasoning: 'SECRET_REASONING',
      toolArgs: { password: 'SECRET_PASSWORD' },
      userId: 42,
      path: '/Users/private/file',
      url: 'https://private.example.test',
      raw: { token: 'SECRET_TOKEN' },
    } as any);

    expect(safe).toEqual({
      type: 'invocation.completed',
      invocation: {
        operationId: 'op_turn_safe_1',
        turnId: 'turn_safe_1',
        generation: 3,
        invocationId: 'op_turn_safe_1:g3:model:0',
        parentInvocationId: 'op_turn_safe_1:g3:run',
        traceId: 'trace_safe_1',
      },
      phase: 'model',
      status: 'unknown',
      atMs: 10,
      durationMs: 4,
      roundIndex: 1,
      attemptIndex: 2,
      messageCount: 7,
      toolCount: 3,
      inputTokens: 11,
      outputTokens: 5,
      totalTokens: 16,
      category: 'transient',
      code: 'MODEL_OUTCOME_UNKNOWN',
    });
    const serialized = JSON.stringify(safe);
    expect(serialized).not.toContain('SECRET');
    expect(serialized).not.toContain('/Users');
    expect(serialized).not.toContain('https://');
  });

  it('rejects token-shaped or path-shaped values in identity fields', () => {
    const safe = sanitizeAgentInvocationTelemetryEvent({
      type: 'invocation.started',
      invocation: {
        operationId: 'sk-secret-token-value',
        turnId: '/Users/private/turn',
        generation: -1,
        invocationId: 'https://private.example.test',
        parentInvocationId: 'Bearer-secret',
        traceId: 'not-a-trace',
      },
      phase: 'run',
      status: 'started',
      atMs: -1,
      code: 'SECRET_CODE_THAT_MATCHES_THE_OLD_PATTERN',
    } as any);

    expect(safe.invocation).toEqual({
      operationId: 'invalid:operation',
      turnId: 'invalid:turn',
      generation: 0,
      invocationId: 'invalid:invocation',
      parentInvocationId: 'invalid:invocation',
      traceId: 'invalid:trace',
    });
    expect(safe.atMs).toBe(0);
    expect(safe.code).toBe('INVALID_CODE');
  });

  it('preserves a real Unix millisecond timestamp without applying count limits', () => {
    const atMs = Date.UTC(2026, 8, 10, 3, 0, 0);
    const safe = sanitizeAgentInvocationTelemetryEvent({
      type: 'invocation.started',
      invocation: {
        operationId: 'op_turn_timestamp_1',
        turnId: 'turn_timestamp_1',
        generation: 1,
        invocationId: 'op_turn_timestamp_1:g1:run',
        traceId: 'trace_timestamp_1',
      },
      phase: 'run',
      status: 'started',
      atMs,
    });

    expect(safe.atMs).toBe(atMs);
  });

  it('swallows synchronous throws and asynchronous sink rejection', async () => {
    jest.spyOn(Logger, 'warn').mockImplementation((): void => undefined);
    const event = sanitizeAgentInvocationTelemetryEvent({
      type: 'invocation.started',
      invocation: {
        operationId: 'op_turn_passive_1',
        turnId: 'turn_passive_1',
        generation: 1,
        invocationId: 'op_turn_passive_1:g1:run',
        traceId: 'trace_passive_1',
      },
      phase: 'run',
      status: 'started',
      atMs: 1,
    });
    const throwing = new AgentInvocationTelemetryAdapter(() => {
      throw new Error('sink failed');
    });
    const rejecting = new AgentInvocationTelemetryAdapter(async () => {
      throw new Error('sink rejected');
    });

    expect(() => throwing.record(event)).not.toThrow();
    expect(() => rejecting.record(event)).not.toThrow();
    await new Promise(resolve => setImmediate(resolve));
    expect(Logger.warn).toHaveBeenCalledTimes(2);
  });
});
