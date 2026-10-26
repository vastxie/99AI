import assert from 'node:assert/strict';
import { register } from 'node:module';
import test from 'node:test';

register('./helpers/module-hooks.mjs', { parentURL: import.meta.url });
const { defineOptions, toOptionMap } = await import('../src/utils/options.ts');
const kernelConstants = await import('../src/constants/index.ts');
const commerceConstants = await import('../src/packs/commerce/constants.ts');

test('toOptionMap 把选项数组折成 value → label 映射，数字 / 字符串键都保持原值', () => {
  assert.deepEqual(
    toOptionMap([
      { value: 0, label: 'a' },
      { value: 1, label: 'b' },
    ]),
    {
      0: 'a',
      1: 'b',
    },
  );
  assert.deepEqual(toOptionMap([{ value: 'x', label: 'X' }]), { x: 'X' });
  assert.deepEqual(toOptionMap([]), {});
});

test('defineOptions 同时给出可变的 options 数组与派生 map，两者内容一致', () => {
  const source = [
    { value: 1, label: '一' },
    { value: 2, label: '二' },
  ];
  const { options, map } = defineOptions(source);
  assert.deepEqual(options, source);
  assert.notEqual(options, source);
  assert.deepEqual(map, { 1: '一', 2: '二' });
  options.push({ value: 3, label: '三' });
  assert.equal(options.length, 3);
});

test('内核用户状态：MAP 与 OPTIONS 由同一份数据派生，且与合并前的手写值一致', () => {
  const { USER_STATUS_OPTIONS, USER_STATUS_MAP, USER_STATUS_CHANGE_OPTIONS } = kernelConstants;
  assert.deepEqual(USER_STATUS_MAP, {
    0: '待激活',
    1: '正常',
    2: '已封禁',
    3: '黑名单',
    4: '游客',
  });
  assert.deepEqual(USER_STATUS_OPTIONS, [
    { value: 0, label: '待激活' },
    { value: 1, label: '正常' },
    { value: 2, label: '已封禁' },
    { value: 3, label: '黑名单' },
    { value: 4, label: '游客' },
  ]);
  assert.ok(USER_STATUS_OPTIONS.every((item) => typeof item.value === 'number'));
  assert.deepEqual(
    USER_STATUS_CHANGE_OPTIONS.map((item) => item.value),
    [0, 1, 2, 3],
  );
});

test('商业包枚举：充值 / 消费 / 支付状态 / 支付平台的映射与合并前的手写值一致', () => {
  const {
    RECHARGE_TYPE_MAP,
    RECHARGE_TYPE_OPTIONS,
    CONSUMPTION_TYPE_OPTIONS,
    ALL_ACCOUNT_TYPE_OPTIONS,
    PAY_STATUS_MAP,
    PAY_STATUS_OPTIONS,
    PAY_PLATFORM_LIST,
    PAY_PLATFORM_MAP,
  } = commerceConstants;
  assert.deepEqual(RECHARGE_TYPE_MAP, {
    1: '注册赠送',
    2: '受邀请赠送',
    3: '邀请人赠送',
    4: '购买套餐赠送',
    5: '管理员调整',
    6: '扫码支付',
    7: '退款',
    8: '签到奖励',
    9: '管理员批量充值',
    10: '普通对话',
    11: '工具调用',
  });
  assert.deepEqual(
    RECHARGE_TYPE_OPTIONS.map((item) => item.value),
    [1, 2, 3, 4, 5, 6, 7, 8, 9],
  );
  assert.deepEqual(
    CONSUMPTION_TYPE_OPTIONS.map((item) => item.value),
    [10, 11],
  );
  assert.deepEqual(ALL_ACCOUNT_TYPE_OPTIONS, [
    ...RECHARGE_TYPE_OPTIONS,
    ...CONSUMPTION_TYPE_OPTIONS,
  ]);
  assert.deepEqual(PAY_STATUS_MAP, { 0: '未支付', 1: '已支付', 2: '支付失败', 3: '支付超时' });
  assert.deepEqual(
    PAY_STATUS_OPTIONS.map((item) => item.value),
    [0, 1, 2, 3],
  );
  assert.deepEqual(PAY_PLATFORM_MAP, {
    epay: '易支付',
    wechat_official: '微信官方',
    alipay_official: '支付宝官方',
    paypal_official: 'PayPal官方',
    stripe_official: 'Stripe官方',
  });
  assert.deepEqual(
    PAY_PLATFORM_LIST.map((item) => item.value),
    ['epay', 'wechat_official', 'alipay_official', 'paypal_official', 'stripe_official'],
  );
  assert.ok(PAY_PLATFORM_LIST.every((item) => typeof item.value === 'string'));
});
