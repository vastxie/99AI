import assert from 'node:assert/strict';
import test from 'node:test';
import { packEnabled } from '../src/utils/packs.ts';

/** 合并前各包入口手写的两种表达式 */
const legacy = (flag) => String(flag ?? 'true').toLowerCase() !== 'false';
const legacyTrimmed = (flag) =>
  String(flag ?? 'true')
    .trim()
    .toLowerCase() !== 'false';

test('packEnabled 与合并前的内联表达式对同一批输入给出相同结果', () => {
  const inputs = [
    undefined,
    null,
    '',
    'true',
    'TRUE',
    'True',
    'false',
    'FALSE',
    'False',
    '0',
    '1',
    'no',
    'off',
    'yes',
    true,
    false,
  ];
  for (const input of inputs) {
    assert.equal(packEnabled(input), legacy(input), `legacy(${String(input)})`);
    assert.equal(packEnabled(input), legacyTrimmed(input), `legacyTrimmed(${String(input)})`);
  }
  assert.equal(packEnabled(undefined), true);
  assert.equal(packEnabled('false'), false);
  assert.equal(packEnabled('FALSE'), false);
  assert.equal(packEnabled('0'), true);
  assert.equal(packEnabled(false), false);
});

test('首尾空白按带 trim 的写法处理：" false " 关闭', () => {
  assert.equal(packEnabled(' false '), false);
  assert.equal(packEnabled(' false '), legacyTrimmed(' false '));
  assert.equal(packEnabled(' true '), true);
});
