import test from 'node:test';
import assert from 'node:assert/strict';
import { loadInternal } from './compile-package.mjs';

const { StopPolicy } = await loadInternal('stop-policy');
const toolCall = (name = 'search_tool') => ({
  id: `call_${name}`,
  type: 'function',
  function: { name, arguments: '{}' },
});

test('stops normally without tool calls', () => {
  const policy = new StopPolicy(3);
  policy.beginRound();
  assert.deepEqual(policy.decideAfterTurn({ aborted: false, malformed: false, toolCalls: [] }), {
    shouldStop: true,
    reason: 'normal_stop',
    result: { success: true, finishReason: 'stop' },
  });
});

test('reports an output-limit stop instead of a normal stop', () => {
  // 各厂商的截断原因都按 length 收尾，并带 stopReason 让宿主提示回复可能不完整
  for (const finishReason of [
    'length',
    'max_tokens',
    'MAX_TOKENS',
    'max_output_tokens',
    'token_limit',
  ]) {
    const policy = new StopPolicy(3);
    policy.beginRound();
    assert.deepEqual(
      policy.decideAfterTurn({ aborted: false, malformed: false, toolCalls: [], finishReason }),
      {
        shouldStop: true,
        reason: 'output_limit',
        result: { success: true, finishReason: 'length', stopReason: 'length' },
      },
    );
  }
  const normal = new StopPolicy(3);
  normal.beginRound();
  assert.equal(
    normal.decideAfterTurn({
      aborted: false,
      malformed: false,
      toolCalls: [],
      finishReason: 'stop',
    }).result.finishReason,
    'stop',
  );
});

test('aborts before capability execution', () => {
  const policy = new StopPolicy(3);
  policy.beginRound();
  const decision = policy.decideAfterTurn({
    aborted: true,
    malformed: false,
    toolCalls: [toolCall()],
  });
  assert.equal(decision.reason, 'abort');
  assert.equal(decision.result.finishReason, 'abort');
});

test('stops when max rounds are exceeded', () => {
  const policy = new StopPolicy(1);
  policy.beginRound();
  assert.equal(
    policy.decideAfterTurn({
      aborted: false,
      malformed: false,
      toolCalls: [toolCall('a')],
    }).shouldStop,
    false,
  );
  policy.beginRound();
  const decision = policy.decideAfterTurn({
    aborted: false,
    malformed: false,
    toolCalls: [toolCall('b')],
  });
  assert.equal(decision.reason, 'max_rounds');
  assert.equal(decision.result.finishReason, 'abort');
  // 宿主靠 stopReason 把轮次上限和用户中止分开提示
  assert.equal(decision.result.stopReason, 'max_rounds');
});

test('hands off on capability control', () => {
  const policy = new StopPolicy(3);
  const decision = policy.decideAfterCapabilities({
    results: [
      {
        callId: 'call_1',
        status: 'success',
        modelContent: 'ok',
        control: { handoff: true },
      },
    ],
    shouldHandoff: false,
  });
  assert.equal(decision.reason, 'handoff');
  assert.deepEqual(decision.result.doneData, { finishReason: 'handoff' });
});

test('hands off to a queued turn after a completed batch', () => {
  const policy = new StopPolicy(3);
  const decision = policy.decideAfterCapabilities({
    results: [{ callId: 'call_1', status: 'success', modelContent: 'ok' }],
    shouldHandoff: true,
  });
  assert.equal(decision.reason, 'queued_turn');
  assert.equal(decision.result.finishReason, 'handoff');
});

test('ends the run normally when a capability asks to terminate', () => {
  const policy = new StopPolicy(3);
  const decision = policy.decideAfterCapabilities({
    results: [
      { callId: 'call_1', status: 'success', modelContent: 'ok' },
      { callId: 'call_2', status: 'success', modelContent: 'asked', control: { terminate: true } },
    ],
    shouldHandoff: false,
  });
  assert.equal(decision.shouldStop, true);
  assert.equal(decision.reason, 'terminate');
  assert.equal(decision.result.finishReason, 'stop');
  assert.equal(decision.result.success, true);
});

test('handoff and a queued user turn take precedence over terminate', () => {
  const policy = new StopPolicy(3);
  const terminating = {
    callId: 'call_1',
    status: 'success',
    modelContent: 'asked',
    control: { terminate: true },
  };
  assert.equal(
    policy.decideAfterCapabilities({
      results: [terminating, { ...terminating, callId: 'call_2', control: { handoff: true } }],
      shouldHandoff: false,
    }).reason,
    'handoff',
  );
  assert.equal(
    policy.decideAfterCapabilities({ results: [terminating], shouldHandoff: true }).reason,
    'queued_turn',
  );
});
