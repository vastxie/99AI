import assert from 'node:assert/strict';
import test from 'node:test';

const { createConfigSaveScheduler } = await import('../src/utils/configSaveScheduler.ts');

/** 可控的请求：每次 send 记下请求，测试决定它成功还是失败 */
function harness(initial = {}, ui = { ...initial }) {
  const requests = [];
  const successes = [];
  let active = true;
  const scheduler = createConfigSaveScheduler({
    send: (values) =>
      new Promise((resolve, reject) => {
        requests.push({ values, resolve, reject: () => reject(new Error('fail')) });
      }),
    read: (key) => (key in ui ? String(ui[key]).trim() : undefined),
    write: (key, raw) => {
      ui[key] = raw;
    },
    onSuccess: (saved) => successes.push(saved),
    isActive: () => active,
  });
  scheduler.init(initial);
  const flush = () => new Promise((resolve) => setTimeout(resolve, 0));
  return {
    scheduler,
    ui,
    requests,
    successes,
    flush,
    deactivate: () => {
      active = false;
    },
    /** 让第 index 个请求结束 */
    async finish(index, ok = true) {
      if (ok) requests[index].resolve();
      else requests[index].reject();
      await flush();
    },
  };
}

test('0→1→0 快速切换：按顺序发出，最终服务端与界面都是 0', async () => {
  const h = harness({ s: '0' });
  h.ui.s = '1';
  const first = h.scheduler.enqueue({ s: '1' });
  h.ui.s = '0';
  const second = h.scheduler.enqueue({ s: '0' });
  await h.flush();
  assert.deepEqual(
    h.requests.map((r) => r.values),
    [{ s: '1' }],
  );
  await h.finish(0);
  assert.deepEqual(
    h.requests.map((r) => r.values),
    [{ s: '1' }, { s: '0' }],
  );
  await h.finish(1);
  assert.equal(await first, true);
  assert.equal(await second, true);
  assert.equal(h.scheduler.confirmedValue('s'), '0');
  assert.equal(h.ui.s, '0');
});

test('连续多次切换：在途一个，排队的只留最后一次，被合并的调用随它结束', async () => {
  const h = harness({ s: '0' });
  const calls = ['1', '0', '1', '0'].map((value) => {
    h.ui.s = value;
    return h.scheduler.enqueue({ s: value });
  });
  await h.flush();
  await h.finish(0);
  assert.deepEqual(
    h.requests.map((r) => r.values.s),
    ['1', '0'],
  );
  await h.finish(1);
  assert.deepEqual(await Promise.all(calls), [true, true, true, true]);
  assert.equal(h.scheduler.confirmedValue('s'), '0');
});

test('成功回执不覆盖用户之后的输入；onSuccess 的参数是这次确认的值', async () => {
  const h = harness({ name: 'old' });
  h.ui.name = 'A';
  const saving = h.scheduler.enqueue({ name: 'A' });
  await h.flush();
  h.ui.name = 'B';
  await h.finish(0);
  assert.equal(await saving, true);
  assert.equal(h.ui.name, 'B');
  assert.deepEqual(h.successes, [{ name: 'A' }]);
  assert.equal(h.scheduler.confirmedValue('name'), 'A');
});

test('失败：界面仍是发出的值才回滚到已确认值；用户已在改的不动', async () => {
  const h = harness({ name: 'old' });
  h.ui.name = 'A';
  const a = h.scheduler.enqueue({ name: 'A' });
  await h.flush();
  await h.finish(0, false);
  assert.equal(await a, false);
  assert.equal(h.ui.name, 'old');

  h.ui.name = 'C';
  const c = h.scheduler.enqueue({ name: 'C' });
  await h.flush();
  h.ui.name = 'D';
  await h.finish(1, false);
  assert.equal(await c, false);
  assert.equal(h.ui.name, 'D');
  assert.equal(h.scheduler.confirmedValue('name'), 'old');
});

test('失败时后面有覆盖它的操作：界面不回滚，继续发后面的', async () => {
  const h = harness({ s: '0' });
  h.ui.s = '1';
  void h.scheduler.enqueue({ s: '1' });
  await h.flush();
  h.ui.s = '1';
  const later = h.scheduler.enqueue({ s: '1', t: 'x' }, { group: true });
  await h.finish(0, false);
  assert.equal(h.ui.s, '1');
  assert.deepEqual(h.requests[1].values, { s: '1', t: 'x' });
  await h.finish(1);
  assert.equal(await later, true);
});

test('同一个值失败后再保存会重新发送', async () => {
  const h = harness({ s: '0' });
  h.ui.s = '1';
  void h.scheduler.enqueue({ s: '1' });
  await h.flush();
  await h.finish(0, false);
  h.ui.s = '1';
  const retry = h.scheduler.enqueue({ s: '1' });
  await h.flush();
  assert.equal(h.requests.length, 2);
  await h.finish(1);
  assert.equal(await retry, true);
});

test('与已确认值相同的单键保存不发请求，并把规范后的值写回界面', async () => {
  const h = harness({ name: 'same' });
  h.ui.name = ' same ';
  assert.equal(await h.scheduler.enqueue({ name: 'same' }), true);
  assert.equal(h.requests.length, 0);
  assert.equal(h.ui.name, 'same');
  assert.deepEqual(h.successes, []);
});

test('先排单键、再排完整覆盖它的成组操作：只发一次整组，失败时整组回滚', async () => {
  const h = harness({ a: 'A', b: 'B', other: '0' });
  void h.scheduler.enqueue({ other: '1' });
  await h.flush();
  h.ui.a = 'typed';
  const single = h.scheduler.enqueue({ a: 'typed' });
  h.ui.a = '';
  h.ui.b = '';
  const group = h.scheduler.enqueue({ a: '', b: '' }, { group: true });
  await h.finish(0);
  assert.deepEqual(
    h.requests.map((r) => r.values),
    [{ other: '1' }, { a: '', b: '' }],
  );
  await h.finish(1, false);
  assert.equal(await single, false);
  assert.equal(await group, false);
  assert.equal(h.ui.a, 'A');
  assert.equal(h.ui.b, 'B');
});

test('先排成组、再排单键（部分重叠）：两个都保留、按顺序整组发送', async () => {
  for (const [groupOk, singleOk, expected] of [
    [true, false, { a: '', b: '' }],
    [false, true, { a: 'C', b: 'B' }],
  ]) {
    const h = harness({ a: 'A', b: 'B', other: '0' });
    void h.scheduler.enqueue({ other: '1' });
    await h.flush();
    h.ui.a = '';
    h.ui.b = '';
    const group = h.scheduler.enqueue({ a: '', b: '' }, { group: true });
    h.ui.a = 'C';
    const single = h.scheduler.enqueue({ a: 'C' });
    await h.finish(0);
    assert.deepEqual(h.requests[1].values, { a: '', b: '' });
    await h.finish(1, groupOk);
    assert.deepEqual(h.requests[2].values, { a: 'C' });
    await h.finish(2, singleOk);
    assert.equal(await group, groupOk);
    assert.equal(await single, singleOk);
    assert.deepEqual(
      { a: h.scheduler.confirmedValue('a'), b: h.scheduler.confirmedValue('b') },
      expected,
    );
    // 界面与已确认值一致
    assert.equal(h.ui.a, expected.a);
    assert.equal(h.ui.b, expected.b);
  }
});

test('两个部分重叠的成组操作：都保留、按顺序整组发送', async () => {
  const h = harness({ a: '1', b: '1', c: '1', other: '0' });
  void h.scheduler.enqueue({ other: '1' });
  await h.flush();
  Object.assign(h.ui, { a: '2', b: '2' });
  const first = h.scheduler.enqueue({ a: '2', b: '2' }, { group: true });
  Object.assign(h.ui, { b: '3', c: '3' });
  const second = h.scheduler.enqueue({ b: '3', c: '3' }, { group: true });
  await h.finish(0);
  await h.finish(1, false);
  await h.finish(2);
  assert.deepEqual(h.requests.map((r) => r.values).slice(1), [
    { a: '2', b: '2' },
    { b: '3', c: '3' },
  ]);
  assert.equal(await first, false);
  assert.equal(await second, true);
  assert.equal(h.ui.a, '1');
  assert.equal(h.ui.b, '3');
  assert.equal(h.ui.c, '3');
});

test('成组操作即使与已确认值相同也整组发出', async () => {
  const h = harness({ a: 'x', b: 'y' });
  const group = h.scheduler.enqueue({ a: 'x', b: 'y' }, { group: true });
  await h.flush();
  assert.equal(h.requests.length, 1);
  await h.finish(0);
  assert.equal(await group, true);
});

test('停用后：排队的不再发、按失败结束；在途的回来只更新已确认值，不写回、不通知', async () => {
  const h = harness({ s: '0', t: '0' });
  h.ui.s = '1';
  const inflight = h.scheduler.enqueue({ s: '1' });
  h.ui.t = '1';
  const queued = h.scheduler.enqueue({ t: '1' });
  await h.flush();
  h.deactivate();
  h.ui.s = 'changed-after-unmount';
  await h.finish(0);
  assert.equal(await inflight, true);
  assert.equal(await queued, false);
  assert.equal(h.requests.length, 1);
  assert.equal(h.scheduler.confirmedValue('s'), '1');
  assert.equal(h.ui.s, 'changed-after-unmount');
  assert.deepEqual(h.successes, []);
});

test('saving 与 desired：在途与排队的键算保存中，期望值取最后一个覆盖它的操作', async () => {
  const h = harness({ s: '0' });
  void h.scheduler.enqueue({ s: '1' });
  void h.scheduler.enqueue({ s: '2' });
  await h.flush();
  assert.equal(h.scheduler.saving('s'), true);
  assert.equal(h.scheduler.desired('s'), '2');
  assert.equal(h.scheduler.saving('other'), false);
  await h.finish(0);
  await h.finish(1);
  assert.equal(h.scheduler.saving('s'), false);
  assert.equal(h.scheduler.desired('s'), '2');
});

test('页面回调出错不卡住后面的保存；等待者结束时这个键已不算保存中', async () => {
  const requests = [];
  const scheduler = createConfigSaveScheduler({
    send: async (values) => {
      requests.push(values);
    },
    read: () => undefined,
    write: () => {
      throw new Error('ui broke');
    },
    onSuccess: () => {
      throw new Error('toast broke');
    },
  });
  scheduler.init({ a: '0' });
  const first = scheduler.enqueue(
    { a: '1' },
    {
      onSaved: () => {
        throw new Error('callback broke');
      },
    },
  );
  assert.equal(await first, true);
  assert.equal(scheduler.saving('a'), false);
  assert.equal(await scheduler.enqueue({ a: '2' }), true);
  assert.deepEqual(requests, [{ a: '1' }, { a: '2' }]);
});
