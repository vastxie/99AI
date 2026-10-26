import test from 'node:test';
import assert from 'node:assert/strict';
import { loadInternal } from './compile-package.mjs';

const { TurnRunner } = await loadInternal('turn-runner');
const { MessageAssembler } = await loadInternal('message-assembler');

/** 按延迟与取消工作的假时钟：advance 推进时间并按到期顺序触发 */
function manualClock() {
  let now = 0;
  const timers = new Set();
  return {
    nowMs: () => now,
    nowIso: () => '2026-08-30T00:00:00.000Z',
    nextId: (prefix) => `${prefix}_fixed`,
    schedule: (callback, delayMs) => {
      const timer = { callback, at: now + delayMs };
      timers.add(timer);
      return timer;
    },
    cancel: (timer) => timers.delete(timer),
    advance(ms) {
      now += ms;
      for (const timer of [...timers].sort((a, b) => a.at - b.at)) {
        if (timer.at <= now && timers.delete(timer)) timer.callback();
      }
    },
    pending: () => timers.size,
  };
}

const settle = () => new Promise((resolve) => setImmediate(resolve));

function runnerHarness(streamFactory, timeoutAttempts = new Set(), clock) {
  let attempt = 0;
  const ports = {
    modelStream: (input) => streamFactory(input, ++attempt),
    capabilityExecutor: async () => [],
    progress: () => undefined,
    trace: () => undefined,
    messagePreparation: {
      prepareForModel: async (messages) => messages,
      projectAssistantMessage: () => ({ role: 'assistant' }),
    },
    lifecycle: {
      prepareCapabilityCommit: () => undefined,
      afterToolRound: () => undefined,
      onMessagesReplaced: () => undefined,
      closeRun: () => undefined,
    },
    logger: () => undefined,
    clock: clock || {
      nowMs: () => 1,
      nowIso: () => '2026-08-30T00:00:00.000Z',
      nextId: (prefix) => `${prefix}_fixed`,
      schedule: (callback) => {
        const scheduledAttempt = attempt + 1;
        if (timeoutAttempts.has(scheduledAttempt)) queueMicrotask(callback);
        return { scheduledAttempt };
      },
      cancel: () => undefined,
    },
  };
  return {
    runner: new TurnRunner(ports, new MessageAssembler()),
    attempts: () => attempt,
  };
}

const input = (signal) => ({
  model: 'test',
  messages: [{ role: 'user', content: 'hello' }],
  tools: [],
  maxRounds: 1,
  signal,
});

function waitForAbort(signal) {
  return new Promise((resolve) => {
    if (signal.aborted) resolve();
    else signal.addEventListener('abort', resolve, { once: true });
  });
}

test('does not replay a provider request after a first-event timeout', async () => {
  const harness = runnerHarness(
    (request) =>
      (async function* () {
        await waitForAbort(request.signal);
      })(),
    new Set([1]),
  );
  await assert.rejects(
    harness.runner.runTurn(input(), input().messages, 0),
    /模型响应超时，请重试/,
  );
  assert.equal(harness.attempts(), 1);
});

test('does not replay when a first-event timeout is projected as abort', async () => {
  const harness = runnerHarness(
    (request) =>
      (async function* () {
        await waitForAbort(request.signal);
        yield { type: 'abort', reason: 'attempt timeout' };
      })(),
    new Set([1]),
  );
  await assert.rejects(
    harness.runner.runTurn(input(), input().messages, 0),
    /模型响应超时，请重试/,
  );
  assert.equal(harness.attempts(), 1);
});

test('does not retry a user-aborted request', async () => {
  const controller = new AbortController();
  controller.abort(new Error('user stopped'));
  const harness = runnerHarness(() =>
    (async function* () {
      yield { type: 'text_delta', delta: 'ignored' };
    })(),
  );
  const result = await harness.runner.runTurn(input(controller.signal), input().messages, 0);
  assert.equal(harness.attempts(), 1);
  assert.equal(result.aborted, true);
});

test('reports a timeout after one bounded request', async () => {
  const harness = runnerHarness(
    (request) =>
      (async function* () {
        await waitForAbort(request.signal);
      })(),
    new Set([1]),
  );
  await assert.rejects(
    harness.runner.runTurn(input(), input().messages, 0),
    /模型响应超时，请重试/,
  );
  assert.equal(harness.attempts(), 1);
});

test('passes stable round and attempt metadata to the provider port', async () => {
  const seen = [];
  const harness = runnerHarness((request) =>
    (async function* () {
      seen.push({
        roundIndex: request.roundIndex,
        attemptIndex: request.attemptIndex,
      });
      yield { type: 'done', finishReason: 'stop' };
    })(),
  );
  await harness.runner.runTurn(input(), input().messages, 3, {
    attemptIndex: 1,
  });
  assert.deepEqual(seen, [{ roundIndex: 3, attemptIndex: 1 }]);
});

test('sends no temperature unless the caller sets one', async () => {
  const seen = [];
  const harness = runnerHarness((request) =>
    (async function* () {
      seen.push(request);
      yield { type: 'done', finishReason: 'stop' };
    })(),
  );
  // 不设默认温度：由模型服务按自己的默认值处理
  await harness.runner.runTurn(input(), input().messages, 0);
  await harness.runner.runTurn({ ...input(), temperature: 0.3 }, input().messages, 1);
  await harness.runner.runTurn({ ...input(), temperature: 0 }, input().messages, 1);
  assert.equal('temperature' in seen[0], false);
  assert.equal(seen[1].temperature, 0.3);
  // 0 是合法温度，不能被当成「没设置」
  assert.equal(seen[2].temperature, 0);
});

test('classifies a thrown AbortError as an aborted turn', async () => {
  const harness = runnerHarness(() =>
    (async function* () {
      const error = new Error('provider stopped');
      error.name = 'AbortError';
      throw error;
    })(),
  );
  const result = await harness.runner.runTurn(input(), input().messages, 0);
  assert.equal(result.aborted, true);
});

test('classifies ABORT_ERR as an aborted turn', async () => {
  const harness = runnerHarness(() =>
    (async function* () {
      const error = new Error('provider interrupted');
      error.code = 'ABORT_ERR';
      throw error;
    })(),
  );
  const result = await harness.runner.runTurn(input(), input().messages, 0);
  assert.equal(result.aborted, true);
});

test('keeps an ordinary provider exception as an error', async () => {
  const harness = runnerHarness(() =>
    (async function* () {
      throw new Error('provider quota exceeded');
    })(),
  );
  await assert.rejects(
    harness.runner.runTurn(input(), input().messages, 0),
    /provider quota exceeded/,
  );
});

/** 先给出 events，再等到请求被中止，然后按 ending 收尾 */
function stallingStream(events, ending) {
  return (request) =>
    (async function* () {
      yield* events;
      await waitForAbort(request.signal);
      if (ending) yield ending;
    })();
}

test('waits 30 seconds for the first event unless a limit is given', async () => {
  for (const [limits, limitMs] of [
    [{}, 30_000],
    [{ firstEventTimeoutMs: 120_000 }, 120_000],
  ]) {
    const clock = manualClock();
    const harness = runnerHarness(stallingStream([]), undefined, clock);
    let outcome;
    harness.runner.runTurn({ ...input(), ...limits }, input().messages, 0).then(
      () => (outcome = 'resolved'),
      (error) => (outcome = error.message),
    );
    await settle();
    clock.advance(limitMs - 1);
    await settle();
    assert.equal(outcome, undefined);
    clock.advance(1);
    await settle();
    assert.equal(outcome, '模型响应超时，请重试');
    assert.equal(clock.pending(), 0);
    assert.equal(harness.attempts(), 1);
  }
});

test('restarts the wait on every event and reports a stalled stream as its own error', async () => {
  for (const ending of [{ type: 'abort', reason: 'aborted' }, undefined]) {
    const clock = manualClock();
    const harness = runnerHarness(
      stallingStream([{ type: 'text_delta', delta: 'partial' }], ending),
      undefined,
      clock,
    );
    let outcome;
    harness.runner
      .runTurn(
        { ...input(), firstEventTimeoutMs: 120_000, idleTimeoutMs: 600_000 },
        input().messages,
        0,
      )
      .then(
        (result) => (outcome = result),
        (error) => (outcome = error.message),
      );
    await settle();
    // 首次响应上限已经随第一个事件取消，之后只按空闲上限计时
    clock.advance(599_999);
    await settle();
    assert.equal(outcome, undefined);
    clock.advance(1);
    await settle();
    assert.equal(outcome, '模型长时间没有输出，已中断，请重试');
    assert.equal(clock.pending(), 0);
    assert.equal(harness.attempts(), 1);
  }
});

test('does not time out while events keep arriving, and clears the timer at the end', async () => {
  const clock = manualClock();
  const harness = runnerHarness(
    () =>
      (async function* () {
        for (let i = 0; i < 5; i += 1) {
          clock.advance(500_000);
          yield { type: 'text_delta', delta: 'a' };
        }
        clock.advance(500_000);
        yield { type: 'done', finishReason: 'stop' };
      })(),
    undefined,
    clock,
  );
  const result = await harness.runner.runTurn(
    { ...input(), firstEventTimeoutMs: 600_000, idleTimeoutMs: 600_000 },
    input().messages,
    0,
  );
  assert.equal(result.aborted, false);
  assert.equal(result.fullContent, 'aaaaa');
  assert.equal(clock.pending(), 0);
});

test('has no idle limit unless one is given', async () => {
  const clock = manualClock();
  const controller = new AbortController();
  const harness = runnerHarness(
    stallingStream([{ type: 'text_delta', delta: 'partial' }]),
    undefined,
    clock,
  );
  const running = harness.runner.runTurn(input(controller.signal), input().messages, 0);
  await settle();
  clock.advance(24 * 3_600_000);
  await settle();
  assert.equal(clock.pending(), 0);
  // 没有空闲上限时只有用户停止能结束这一轮
  controller.abort(new Error('user stopped'));
  assert.equal((await running).aborted, true);
});

test('treats a user stop during the wait as a stop, not a timeout', async () => {
  const clock = manualClock();
  const controller = new AbortController();
  const harness = runnerHarness(
    stallingStream([{ type: 'text_delta', delta: 'partial' }], { type: 'abort' }),
    undefined,
    clock,
  );
  const running = harness.runner.runTurn(
    { ...input(controller.signal), idleTimeoutMs: 600_000 },
    input().messages,
    0,
  );
  await settle();
  controller.abort(new Error('user stopped'));
  const result = await running;
  assert.equal(result.aborted, true);
  assert.equal(clock.pending(), 0);
});

test('treats the turn as stopped when the user stops right after the wait expired', async () => {
  const clock = manualClock();
  const controller = new AbortController();
  const harness = runnerHarness(
    stallingStream([{ type: 'text_delta', delta: 'partial' }], { type: 'abort' }),
    undefined,
    clock,
  );
  const running = harness.runner.runTurn(
    { ...input(controller.signal), idleTimeoutMs: 600_000 },
    input().messages,
    0,
  );
  await settle();
  clock.advance(600_000);
  controller.abort(new Error('user stopped'));
  const result = await running;
  assert.equal(result.aborted, true);
});

test('keeps a stream that finished properly even if the wait expired first', async () => {
  const clock = manualClock();
  let release;
  const gate = new Promise((resolve) => (release = resolve));
  const harness = runnerHarness(
    () =>
      (async function* () {
        yield { type: 'text_delta', delta: 'whole answer' };
        await gate;
        yield { type: 'done', finishReason: 'stop' };
      })(),
    undefined,
    clock,
  );
  const running = harness.runner.runTurn(
    { ...input(), idleTimeoutMs: 600_000 },
    input().messages,
    0,
  );
  await settle();
  clock.advance(600_000);
  release();
  const result = await running;
  assert.equal(result.aborted, false);
  assert.equal(result.finishReason, 'stop');
  assert.equal(result.fullContent, 'whole answer');
});
