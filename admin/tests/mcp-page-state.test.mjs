import assert from 'node:assert/strict';
import test from 'node:test';

const { buildMcpSaveBody, canMutateMcpServers, isMcpDialogStale, saveFromSnapshot } =
  await import('../src/views/ai/mcpPageState.ts');

test('MCP 页面：加载成功前、刷新中、刷新失败后、保存中都不能修改', () => {
  const ready = { loaded: true, loading: false, loadFailed: false, saving: false };
  assert.equal(canMutateMcpServers(ready), true);
  assert.equal(canMutateMcpServers({ ...ready, loaded: false }), false);
  assert.equal(canMutateMcpServers({ ...ready, loading: true }), false);
  assert.equal(canMutateMcpServers({ ...ready, loadFailed: true }), false);
  assert.equal(canMutateMcpServers({ ...ready, saving: true }), false);
});

test('MCP 页面：弹窗打开后快照变了不能提交；保存带快照的修订号，确认丢弃时才带 discardInvalid', () => {
  assert.equal(isMcpDialogStale('rev-a', 'rev-a'), false);
  assert.equal(isMcpDialogStale('rev-a', 'rev-b'), true);
  assert.equal(isMcpDialogStale(null, 'rev-a'), true);
  const servers = [{ name: 'docs' }];
  assert.deepEqual(buildMcpSaveBody(servers, { revision: 'r1', storedErrors: [] }, false), {
    servers,
    revision: 'r1',
  });
  assert.deepEqual(buildMcpSaveBody([], { revision: 'none', storedErrors: [] }, false), {
    servers: [],
    revision: 'none',
  });
  assert.deepEqual(buildMcpSaveBody(servers, { revision: 'r1', storedErrors: ['坏条目'] }, true), {
    servers,
    revision: 'r1',
    discardInvalid: true,
  });
  assert.deepEqual(buildMcpSaveBody(servers, { revision: 'r1', storedErrors: [] }, true), {
    servers,
    revision: 'r1',
  });
  // 有坏条目但没确认丢弃：不带 discardInvalid（服务端会回 409，不会静默丢弃）
  assert.deepEqual(buildMcpSaveBody(servers, { revision: 'r1', storedErrors: ['坏条目'] }, false), {
    servers,
    revision: 'r1',
  });
});

/** MCP 保存：快照与确认由测试控制 */
function mcpSaveHarness(initial) {
  let current = initial;
  const sent = [];
  let answer;
  const confirmations = [];
  const run = (build) =>
    saveFromSnapshot({
      current: () => current,
      build: (snapshot) => build(snapshot.servers),
      confirmDiscard: (errors) =>
        new Promise((resolve) => {
          confirmations.push(errors);
          answer = resolve;
        }),
      send: async (body) => {
        sent.push(body);
        return { ...current, revision: 'saved' };
      },
    });
  return {
    run,
    sent,
    confirmations,
    replace: (next) => {
      current = next;
    },
    confirm: (ok) => answer(ok),
  };
}

test('MCP 保存：确认丢弃期间刷新带回新快照，放弃提交，不把旧列表配上新修订号', async () => {
  const page = mcpSaveHarness({ servers: ['a'], revision: 'r1', storedErrors: ['坏条目'] });
  const saving = page.run((servers) => [...servers, 'new']);
  await Promise.resolve();
  assert.deepEqual(page.confirmations, [['坏条目']]);
  page.replace({ servers: ['a', 'b'], revision: 'r2', storedErrors: ['坏条目', '新坏条目'] });
  page.confirm(true);
  assert.deepEqual(await saving, { status: 'stale' });
  assert.deepEqual(page.sent, []);
});

test('MCP 保存：确认丢弃后列表、修订号都来自同一份快照；拒绝确认不发；没有坏条目直接发', async () => {
  const withErrors = mcpSaveHarness({ servers: ['a'], revision: 'r1', storedErrors: ['坏条目'] });
  const saving = withErrors.run((servers) => [...servers, 'new']);
  await Promise.resolve();
  withErrors.confirm(true);
  assert.equal((await saving).status, 'saved');
  assert.deepEqual(withErrors.sent, [
    { servers: ['a', 'new'], revision: 'r1', discardInvalid: true },
  ]);

  const declined = mcpSaveHarness({ servers: ['a'], revision: 'r1', storedErrors: ['坏条目'] });
  const cancelled = declined.run((servers) => servers);
  await Promise.resolve();
  declined.confirm(false);
  assert.deepEqual(await cancelled, { status: 'cancelled' });
  assert.deepEqual(declined.sent, []);

  const clean = mcpSaveHarness({ servers: ['a'], revision: 'r3', storedErrors: [] });
  assert.equal((await clean.run((servers) => servers.slice(1))).status, 'saved');
  assert.deepEqual(clean.confirmations, []);
  assert.deepEqual(clean.sent, [{ servers: [], revision: 'r3' }]);
});
