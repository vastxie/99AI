import test from 'node:test';
import assert from 'node:assert/strict';
import { loadInternal } from './compile-package.mjs';

const { MessageAssembler } = await loadInternal('message-assembler');

test('removes orphan tool messages after recent-window trimming', () => {
  const messages = [
    { role: 'system', content: 'system' },
    { role: 'tool', tool_call_id: 'orphan', content: 'old result' },
    { role: 'user', content: 'new request' },
  ];
  new MessageAssembler().sanitizeMessageSequence(messages);
  assert.deepEqual(messages, [
    { role: 'system', content: 'system' },
    { role: 'user', content: 'new request' },
  ]);
});

test('materializes an explicit interrupted result for incomplete tool history', () => {
  const messages = [
    {
      role: 'assistant',
      content: null,
      tool_calls: [
        {
          id: 'call_1',
          type: 'function',
          function: { name: 'demo', arguments: '{}' },
        },
      ],
    },
    { role: 'user', content: 'interrupt' },
    { role: 'tool', tool_call_id: 'call_1', content: 'late' },
  ];
  new MessageAssembler().sanitizeMessageSequence(messages);
  assert.equal(messages[0].role, 'assistant');
  assert.equal(messages[1].role, 'tool');
  assert.equal(messages[1].tool_call_id, 'call_1');
  assert.match(messages[1].content, /中断.*未知/);
  assert.deepEqual(messages.slice(2), [{ role: 'user', content: 'interrupt' }]);
});

test('groups complete tool sequences at legal context cut points', async () => {
  const { groupAgentRuntimeMessages, projectAgentRuntimeMessages } =
    await loadInternal('message-assembler');
  const messages = [
    { role: 'system', content: 'policy' },
    { role: 'user', content: 'old request' },
    {
      role: 'assistant',
      content: null,
      tool_calls: [
        {
          id: 'call_old',
          type: 'function',
          function: { name: 'read', arguments: '{}' },
        },
      ],
    },
    { role: 'tool', tool_call_id: 'call_old', content: 'x'.repeat(400) },
    { role: 'assistant', content: 'old answer' },
    { role: 'user', content: 'current request' },
  ];
  const groups = groupAgentRuntimeMessages(messages);
  assert.deepEqual(
    groups.map((group) => group.kind),
    ['system', 'turn', 'tool_sequence', 'message', 'turn'],
  );
  assert.equal(groups[2].messages.length, 2);

  const projected = projectAgentRuntimeMessages({ messages, maxTokens: 30 });
  const toolSequence = projected.droppedGroups.find((group) => group.kind === 'tool_sequence');
  assert.equal(toolSequence.messages.length, 2);
  assert.equal(
    projected.messages.some((message) => message.tool_call_id === 'call_old'),
    false,
  );
  assert.equal(
    projected.messages.some((message) => message.content === 'policy'),
    true,
  );
  assert.equal(
    projected.messages.some((message) => message.content === 'current request'),
    true,
  );
});

test('reports when required system/current messages alone exceed the budget', async () => {
  const { projectAgentRuntimeMessages } = await loadInternal('message-assembler');
  const projected = projectAgentRuntimeMessages({
    messages: [
      { role: 'system', content: 's'.repeat(200) },
      { role: 'user', content: 'u'.repeat(200) },
    ],
    maxTokens: 10,
  });
  assert.equal(projected.overBudgetRequired, true);
  assert.equal(projected.droppedGroups.length, 0);
});

test('keeps complete assistant tool call/result sequences', () => {
  const messages = [
    {
      role: 'assistant',
      content: null,
      tool_calls: [
        {
          id: 'call_1',
          type: 'function',
          function: { name: 'demo', arguments: '{}' },
        },
      ],
    },
    { role: 'tool', tool_call_id: 'call_1', content: 'ok' },
    { role: 'assistant', content: 'done' },
  ];
  new MessageAssembler().sanitizeMessageSequence(messages);
  assert.equal(messages.length, 3);
  assert.equal(messages[1].tool_call_id, 'call_1');
});
