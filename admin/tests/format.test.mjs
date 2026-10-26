import assert from 'node:assert/strict';
import { register } from 'node:module';
import test from 'node:test';

register('./helpers/module-hooks.mjs', { parentURL: import.meta.url });
const { formatDateTime, formatMoney, formatNumber } = await import('../src/utils/format.ts');
const { utcToShanghaiTime } = await import('../src/utils/utcFormatTime.ts');

/** 合并前散落在各页的实现 */
const legacyProfileDate = (value, fallback = '—') =>
  value ? utcToShanghaiTime(value, 'YYYY-MM-DD HH:mm:ss') : fallback;
const legacyUnixTime = (timestamp) =>
  timestamp
    ? utcToShanghaiTime(new Date(timestamp * 1000).toISOString(), 'YYYY-MM-DD HH:mm:ss')
    : '—';
const legacyOrderMoney = (value) => {
  const num = Number(value || 0);
  return `¥${(Number.isFinite(num) ? num : 0).toFixed(2)}`;
};
const legacyProfileMoney = (value) => {
  const num = Number(value || 0);
  return `¥${Number.isFinite(num) ? num.toFixed(2) : '0.00'}`;
};
const legacyUnguardedMoney = (value) => `¥${Number(value).toFixed(2)}`;

test('formatDateTime：UTC 时间转北京时间到秒，空值显示 —（或自定义占位），非法时间显示空串', () => {
  assert.equal(formatDateTime('2026-01-02T03:04:05.000Z'), '2026-01-02 11:04:05');
  assert.equal(formatDateTime('2026-01-02T03:04:05.000Z', '暂无'), '2026-01-02 11:04:05');
  assert.equal(formatDateTime(null), '—');
  assert.equal(formatDateTime(undefined), '—');
  assert.equal(formatDateTime(''), '—');
  assert.equal(formatDateTime(undefined, '暂无支付'), '暂无支付');
  assert.equal(formatDateTime('not-a-date'), '');
  for (const value of ['2026-01-02T03:04:05.000Z', 'not-a-date', null, undefined, '']) {
    assert.equal(formatDateTime(value), legacyProfileDate(value));
    assert.equal(formatDateTime(value, '暂无'), legacyProfileDate(value, '暂无'));
  }
  // 微信素材的秒级时间戳：包装成 ISO 后走同一个助手，与合并前的 formatTime 一致
  for (const timestamp of [0, undefined, 1700000000]) {
    assert.equal(
      formatDateTime(timestamp ? new Date(timestamp * 1000).toISOString() : ''),
      legacyUnixTime(timestamp),
    );
  }
  assert.equal(formatDateTime(new Date(1700000000 * 1000).toISOString()), '2023-11-15 06:13:20');
});

test('formatMoney：¥ + 两位小数，与合并前带 NaN 保护的两种写法逐字一致', () => {
  const inputs = [
    0,
    1,
    12,
    12.5,
    12.345,
    '3',
    '3.14159',
    1e6,
    -5,
    null,
    undefined,
    '',
    'abc',
    NaN,
    Infinity,
    -0,
  ];
  for (const value of inputs) {
    assert.equal(formatMoney(value), legacyOrderMoney(value), `order ${String(value)}`);
    assert.equal(formatMoney(value), legacyProfileMoney(value), `profile ${String(value)}`);
  }
  assert.equal(formatMoney(12), '¥12.00');
  assert.equal(formatMoney('3.14159'), '¥3.14');
  assert.equal(formatMoney(null), '¥0.00');
  assert.equal(formatMoney('abc'), '¥0.00');
});

test('formatMoney：对合法数字与合并前无保护的 `¥${Number(x).toFixed(2)}` 一致；非数字由 ¥NaN 变为 ¥0.00', () => {
  for (const value of [0, 1, 12.5, '3', '3.14159', 1e6]) {
    assert.equal(formatMoney(value), legacyUnguardedMoney(value), String(value));
  }
  assert.equal(legacyUnguardedMoney('abc'), '¥NaN');
  assert.equal(formatMoney('abc'), '¥0.00');
});

test('formatNumber：千分位，空值 / 非数字显示 0', () => {
  assert.equal(formatNumber(1234567), (1234567).toLocaleString());
  assert.equal(formatNumber('42'), '42');
  assert.equal(formatNumber(null), '0');
  assert.equal(formatNumber(undefined), '0');
  assert.equal(formatNumber('abc'), '0');
});
