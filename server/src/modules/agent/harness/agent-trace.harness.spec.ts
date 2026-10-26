import { AgentTraceHarness } from './agent-trace.harness';

declare const describe: any;
declare const expect: any;
declare const it: any;

describe('AgentTraceHarness', () => {
  it('creates and finalizes trace summaries with existing UnifiedMessage shape', () => {
    const harness = new AgentTraceHarness();
    const currentMessage: any = { role: 'assistant', content: '', rounds: [] };
    const options: any = {
      chatId: 'cid-1',
      messageId: 'cid-1',
      turnId: 'turn-1',
      userId: 3,
      currentMessage,
      tokenUsage: {
        totalInputTokens: 4,
        totalOutputTokens: 5,
        totalTokens: 9,
        details: [],
      },
      toolCost: 1,
    };

    const trace = harness.ensureRunTrace(options, 'gpt-test');
    trace.rounds.push({
      roundIndex: 0,
      startedAt: new Date().toISOString(),
      status: 'success',
      toolCalls: [
        { callId: 'call_1', toolName: 'tool', output: { kind: 'generic' }, status: 'success' },
      ],
    });

    harness.finalizeRunTrace(currentMessage, options, 'success');

    expect(currentMessage.trace).toMatchObject({
      traceId: expect.stringMatching(/^trace_/),
      cid: 'cid-1',
      messageId: 'cid-1',
      turnId: 'turn-1',
      userUid: '3',
      model: 'gpt-test',
      status: 'success',
      summary: expect.objectContaining({
        roundCount: 1,
        toolCallCount: 1,
        totalTokens: 9,
        toolCost: 1,
      }),
    });
  });

  it('sanitizes tool trace details before storing internal.trace', () => {
    const harness = new AgentTraceHarness();
    const traced = harness.withToolTrace({
      id: 'call_runtime_1',
      toolName: 'runtime_pdf',
      status: 'error',
      duration: 42,
      inputSummary: 'token: SECRET data:image/png;base64,' + 'A'.repeat(160),
      model: {
        content:
          'Runtime stdout: raw secret /api/files/file_secretsecretsecretsecret/preview Bearer abc.def',
        output: { kind: 'runtime' },
      },
      display: {
        publicError:
          'Runtime 失败 Bearer secret-token storagePath: /storage/private/output.log stderr: boom',
      },
      internal: {
        fileRefs: {
          entries: [{ fileRef: 'output_file_1', fileId: 'file_secretsecretsecretsecret' }],
        },
      },
    });

    expect(traced.internal.trace).toMatchObject({
      callId: 'call_runtime_1',
      toolName: 'runtime_pdf',
      output: { kind: 'runtime' },
      status: 'error',
      durationMs: 42,
      fileRefs: ['output_file_1'],
      errorCode: 'TOOL_EXECUTION_ERROR',
    });
    const serializedTrace = JSON.stringify(traced.internal.trace);
    expect(serializedTrace).not.toContain('file_secretsecretsecretsecret');
    expect(serializedTrace).not.toContain('/api/files/');
    expect(serializedTrace).not.toContain('/storage/private');
    expect(serializedTrace).not.toContain('secret-token');
    expect(serializedTrace).not.toContain('token: SECRET');
    expect(serializedTrace).not.toContain('base64');
    expect(serializedTrace).not.toContain('stdout');
    expect(serializedTrace).not.toContain('stderr');
  });

  it('marks the current completed round as skipped or error on non-success finalize', () => {
    const harness = new AgentTraceHarness();
    const currentMessage: any = { role: 'assistant', content: '', rounds: [] };
    const options: any = { currentMessage };
    const trace = harness.ensureRunTrace(options, 'gpt-test');
    trace.rounds.push(
      {
        roundIndex: 0,
        startedAt: new Date().toISOString(),
        endedAt: new Date().toISOString(),
        status: 'success',
        toolCalls: [],
      },
      {
        roundIndex: 1,
        startedAt: new Date().toISOString(),
        endedAt: new Date().toISOString(),
        status: 'success',
        toolCalls: [],
      },
    );

    harness.finalizeRunTrace(currentMessage, options, 'aborted');

    expect(currentMessage.trace.rounds[0].status).toBe('success');
    expect(currentMessage.trace.rounds[1].status).toBe('skipped');
  });
});
