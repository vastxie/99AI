import { AgentLoopLifecycleHarness } from './agent-loop-lifecycle.harness';
import { AgentTraceHarness } from './agent-trace.harness';

declare const describe: any;
declare const expect: any;
declare const it: any;

describe('AgentLoopLifecycleHarness', () => {
  it('emits done, finalizes trace, and preserves result fields', () => {
    const traceHarness = new AgentTraceHarness();
    const lifecycle = new AgentLoopLifecycleHarness(traceHarness);
    const events: any[] = [];
    const message: any = { role: 'assistant', content: 'ok', rounds: [] };
    const options: any = {
      currentMessage: message,
      onProgress: (event: any) => events.push(event),
      tokenUsage: {
        totalInputTokens: 10,
        totalOutputTokens: 11,
        totalTokens: 21,
        details: [{ cacheHitTokens: 2, cacheMissTokens: 3 }],
      },
      toolCost: 4,
    };
    traceHarness.ensureRunTrace(options, 'gpt-test');

    const result = lifecycle.finalizeRun({
      message,
      options,
      traceStatus: 'success',
      finishReason: 'handoff',
      success: true,
      doneData: { marker: 'kept' },
    });

    expect(result).toMatchObject({
      success: true,
      message,
      finishReason: 'handoff',
      tokenUsage: {
        totalInputTokens: 10,
        totalOutputTokens: 11,
        totalTokens: 21,
        cacheHitTokens: 2,
        cacheMissTokens: 3,
      },
      toolCost: 4,
    });
    expect(message.trace.status).toBe('success');
    expect(events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'done',
          data: { marker: 'kept', finishReason: 'handoff' },
        }),
      ]),
    );
  });
});
