import assert from 'node:assert/strict';
import { register } from 'node:module';
import test from 'node:test';

process.env.NODE_ENV = 'production';
register('./helpers/module-hooks.mjs', { parentURL: import.meta.url, data: { stubs: {} } });

const { createLatestGate, createLatestLoader } = await import('../src/utils/latestRequest.ts');
const { channelFieldValue } = await import('../src/packs/commerce/channelFields.ts');
const { default: usePagedTable } = await import('../src/utils/composables/usePagedTable.ts');
const { emptyFieldValue, pickFieldValues, resetFieldValues } =
  await import('../src/components/FilterBar/filterValues.ts');
const { createRemoteFields } = await import('../src/components/FilterBar/remoteFields.ts');
const { signedCreditChange, formatCreditChange, creditChangeTone } =
  await import('../src/packs/commerce/accountLog.ts');
const { packagePriceText, paymentAmountText, usdPriceOf } =
  await import('../src/packs/commerce/paymentAmount.ts');
const { userCellLinkable } = await import('../src/components/UserCell/userCellLink.ts');
const { createModelStatusToggles } = await import('../src/views/ai/modelStatusToggle.ts');

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));
function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

test('latestGate：只认最后一次，invalidate 让在途的全部作废', () => {
  const gate = createLatestGate();
  const first = gate.begin();
  const second = gate.begin();
  assert.equal(gate.isLatest(first), false);
  assert.equal(gate.isLatest(second), true);
  gate.invalidate();
  assert.equal(gate.isLatest(second), false);
});

test('分页表格：响应倒序到达只落最新的，旧请求成功或失败都不改表格、不结束加载态', async () => {
  const calls = [];
  const table = usePagedTable((ctx) => {
    const d = deferred();
    calls.push({ ...d, ctx });
    return d.promise;
  });
  const first = table.query();
  const second = table.query();
  assert.equal(table.loading.value, true);
  calls[1].resolve({ rows: ['new'], count: 1 });
  await second;
  assert.deepEqual(table.tableData.value, ['new']);
  assert.equal(table.loading.value, false);
  assert.equal(calls[0].ctx.isCurrent(), false);
  assert.equal(calls[1].ctx.isCurrent(), true);
  calls[0].resolve({ rows: ['old'], count: 9 });
  await first;
  assert.deepEqual(table.tableData.value, ['new']);
  assert.equal(table.total.value, 1);

  // 旧请求失败、新请求还在途：不结束加载态
  const third = table.query();
  const fourth = table.query();
  calls[2].reject(new Error('offline'));
  await third;
  assert.equal(table.loading.value, true);
  calls[3].resolve({ rows: ['latest'], count: 2 });
  await fourth;
  assert.equal(table.loading.value, false);
  assert.deepEqual(table.tableData.value, ['latest']);
});

test('分页表格：search 回到第一页再查', async () => {
  const pageState = { page: 3 };
  const table = usePagedTable(async () => ({ rows: [], count: 0 }), pageState);
  await table.search();
  assert.equal(pageState.page, 1);
});

test('筛选栏的值只含声明的字段：重置值、草稿都不含关键词、页码与页面自管的键', () => {
  const fields = [{ key: 'status' }, { key: 'range', type: 'date-range' }];
  assert.deepEqual(resetFieldValues(fields), { status: '', range: null });
  assert.equal(emptyFieldValue('date-range'), null);
  assert.equal(emptyFieldValue('select'), '');
  const formInline = { status: 1, range: ['a', 'b'], keyword: 'kw', page: 4, userId: 7 };
  assert.deepEqual(pickFieldValues(fields, formInline), { status: 1, range: ['a', 'b'] });

  // 页面按 Object.assign 合并：先合并重置值、再清关键词，关键词不会被写回，自管的键保留
  const merged = { ...formInline };
  Object.assign(merged, resetFieldValues(fields));
  merged.keyword = '';
  assert.deepEqual(merged, { status: '', range: null, keyword: '', page: 4, userId: 7 });
});

test('账户明细：方向按带符号的数值，管理员扣减显示 - 且为支出', () => {
  assert.equal(signedCreditChange(5, -30), -30);
  assert.equal(formatCreditChange(signedCreditChange(5, -30)), '-30');
  assert.equal(creditChangeTone(signedCreditChange(5, -30)), 'expense');
  assert.equal(signedCreditChange(5, 20), 20);
  assert.equal(creditChangeTone(20), 'income');
  // 消费类服务端记正数：一律按支出
  assert.equal(signedCreditChange(10, 3), -3);
  assert.equal(signedCreditChange(11, '4'), -4);
  assert.equal(formatCreditChange(signedCreditChange(6, 100)), '+100');
  assert.equal(formatCreditChange(0), '0');
  assert.equal(creditChangeTone(0), 'neutral');
});

test('支付测试金额：美元渠道显示美元（没有美元价时标明估算），下单后以渠道返回的金额与币种为准', () => {
  assert.deepEqual(usdPriceOf({ priceUsd: '9.99', price: 70 }), {
    text: '$9.99',
    estimated: false,
  });
  assert.deepEqual(usdPriceOf({ priceUsd: 0, price: 73 }), { text: '$10.00', estimated: true });
  assert.equal(packagePriceText({ priceUsd: '9.99', price: 70 }, 'paypal_official'), '$9.99');
  assert.equal(packagePriceText({ price: 73 }, 'stripe_official'), '$10.00（估算）');
  assert.equal(packagePriceText({ price: 73 }, 'epay'), '¥73.00');
  assert.equal(packagePriceText({ price: 73 }, undefined), '¥73.00');
  assert.equal(paymentAmountText({ amount: '10.00', currency: 'USD' }, 73), '$10.00');
  assert.equal(paymentAmountText({ amount: '73.00', currency: 'CNY' }, 73), '¥73.00');
  assert.equal(paymentAmountText(undefined, 73), '¥73.00');
  assert.equal(paymentAmountText({ amount: '', currency: 'USD' }, 73), '¥73.00');
});

test('用户单元：超级管理员且有 id 才是链接；关掉 link 或没有权限只显示文字', () => {
  assert.equal(userCellLinkable({ userId: 7, canAccessDetail: true }), true);
  assert.equal(userCellLinkable({ userId: 7, canAccessDetail: false }), false);
  assert.equal(userCellLinkable({ link: false, userId: 7, canAccessDetail: true }), false);
  assert.equal(userCellLinkable({ userId: null, canAccessDetail: true }), false);
  assert.equal(userCellLinkable({ userId: 0, canAccessDetail: true }), false);
});

test('模型启用开关：按 id 排队，整表刷新不覆盖在途的期望值，成功只改这一行，失败回到原状态', async () => {
  let rows = [
    { id: 1, status: false },
    { id: 2, status: true },
  ];
  const requests = [];
  const saved = [];
  const toggles = createModelStatusToggles({
    rows: () => rows,
    send: (id, enabled) => {
      const d = deferred();
      requests.push({ id, enabled, ...d });
      return d.promise;
    },
    onSaved: (enabled) => saved.push(enabled),
  });
  const turnOn = toggles.toggle(rows[0], true);
  assert.equal(toggles.statusOf(rows[0]), true);
  assert.equal(toggles.saving(1), true);
  // 整表刷新换掉行对象：仍显示期望值
  rows = [
    { id: 1, status: false },
    { id: 2, status: true },
  ];
  assert.equal(toggles.statusOf(rows[0]), true);
  await flush();
  requests[0].resolve();
  assert.equal(await turnOn, true);
  assert.equal(rows[0].status, true);
  assert.equal(toggles.saving(1), false);
  assert.deepEqual(saved, [true]);

  // 失败：回到已确认的状态；同一个值再切会重新发送
  const turnOff = toggles.toggle(rows[1], false);
  await flush();
  requests[1].reject(new Error('fail'));
  assert.equal(await turnOff, false);
  assert.equal(toggles.statusOf(rows[1]), true);
  const retry = toggles.toggle(rows[1], false);
  await flush();
  assert.equal(requests.length, 3);
  requests[2].resolve();
  assert.equal(await retry, true);
  assert.equal(rows[1].status, false);
});

test('latestLoader：后发的取代先发的；作废时收起加载态，晚到的结果不写；失败吞掉', async () => {
  const applied = [];
  const loading = [];
  const loader = createLatestLoader({
    apply: (value) => applied.push(value),
    setLoading: (value) => loading.push(value),
  });
  const first = deferred();
  const second = deferred();
  const r1 = loader.run(() => first.promise);
  const r2 = loader.run(() => second.promise);
  second.resolve('B');
  await r2;
  first.resolve('A');
  await r1;
  assert.deepEqual(applied, ['B']);
  assert.equal(loading.at(-1), false);

  // 在途时作废（重置、换值）：加载态立即收起，结果晚到不写
  const third = deferred();
  const r3 = loader.run(() => third.promise);
  assert.equal(loading.at(-1), true);
  loader.invalidate();
  assert.equal(loading.at(-1), false);
  third.resolve('C');
  await r3;
  assert.deepEqual(applied, ['B']);
  assert.equal(loading.at(-1), false);

  // 失败：不写、不抛，加载态收起；之后照常
  await loader.run(() => Promise.reject(new Error('offline')));
  assert.equal(loading.at(-1), false);
  await loader.run(async () => 'D');
  assert.deepEqual(applied, ['B', 'D']);
});

test('支付参数字段：没配置过（空串）显示默认选项，加载与回滚一致', () => {
  assert.equal(channelFieldValue('', 'platform_cert'), 'platform_cert');
  assert.equal(channelFieldValue(undefined, 'platform_cert'), 'platform_cert');
  assert.equal(channelFieldValue('public_key', 'platform_cert'), 'public_key');
  assert.equal(channelFieldValue('', undefined), '');
});

test('模型启用开关：保存完成后列表刷新带回别处改过的状态，再切换会照常发送', async () => {
  let rows = [{ id: 1, status: false }];
  const requests = [];
  const toggles = createModelStatusToggles({
    rows: () => rows,
    send: async (id, enabled) => {
      requests.push({ id, enabled });
    },
  });
  assert.equal(await toggles.toggle(rows[0], true), true);
  assert.equal(requests.length, 1);
  // 别处把它停用了：刷新后的行是 false
  rows = [{ id: 1, status: false }];
  assert.equal(await toggles.toggle(rows[0], true), true);
  assert.equal(requests.length, 2);
  assert.equal(rows[0].status, true);
});

/** 远程字段：搜索由测试逐个放行 */
function remoteFieldHarness(applied = {}) {
  const requests = [];
  const field = {
    key: 'userId',
    label: '用户',
    type: 'remote-select',
    fetchOptions: (query) => {
      const request = deferred();
      requests.push({ query, ...request });
      return request.promise;
    },
  };
  const remote = createRemoteFields((key) => applied[key]);
  return { field, remote, requests, applied };
}

test('筛选栏远程字段：搜索在途时在面板里选中，旧结果不再写入候选，加载态收起，选中项标签留给 chips', async () => {
  const { field, remote, requests } = remoteFieldHarness();
  remote.search(field, '');
  requests[0].resolve([{ label: '张三', value: 1 }]);
  await flush();
  remote.search(field, '李');
  assert.equal(remote.loading.value.userId, true);
  remote.change(field, 1);
  assert.equal(remote.loading.value.userId, false);
  assert.equal(remote.labelCache.value.userId[1], '张三');
  requests[1].resolve([{ label: '李四', value: 2 }]);
  await flush();
  assert.deepEqual(remote.fieldOptions(field), [{ label: '张三', value: 1 }]);
  assert.equal(remote.loading.value.userId, false);
});

test('筛选栏远程字段：搜索在途时清空，旧结果不再写入；之后的新搜索照常落地', async () => {
  const { field, remote, requests } = remoteFieldHarness();
  remote.search(field, '王');
  remote.change(field, '');
  assert.equal(remote.loading.value.userId, false);
  requests[0].resolve([{ label: '王五', value: 3 }]);
  await flush();
  assert.deepEqual(remote.fieldOptions(field), []);
  remote.search(field, '赵');
  requests[1].resolve([{ label: '赵六', value: 4 }]);
  await flush();
  assert.deepEqual(remote.fieldOptions(field), [{ label: '赵六', value: 4 }]);
});

test('筛选栏远程字段：带入的值回查标签，回来时值已换就不写；重置清掉候选与标签并作废在途搜索', async () => {
  const applied = { userId: 7 };
  const { field, remote, requests } = remoteFieldHarness(applied);
  const label = deferred();
  field.resolveLabel = () => label.promise;
  remote.ensureLabel(field);
  applied.userId = 8;
  label.resolve('旧用户');
  await flush();
  assert.equal(remote.labelCache.value.userId?.[7], undefined);

  remote.search(field, '');
  requests[0].resolve([{ label: '张三', value: 1 }]);
  await flush();
  remote.change(field, 1);
  remote.search(field, '李');
  remote.reset();
  assert.equal(remote.loading.value.userId, false);
  requests[1].resolve([{ label: '李四', value: 2 }]);
  await flush();
  assert.deepEqual(remote.fieldOptions(field), []);
  assert.deepEqual(remote.labelCache.value, {});
});
