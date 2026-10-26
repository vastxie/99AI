import assert from 'node:assert/strict';
import test from 'node:test';

const {
  EXPORT_FIELDS,
  canUseKeyForRequest,
  copiedModelOverrides,
  isMaskedKey,
  modelFormValuesFromRow,
  parseModelConfigJson,
} = await import('../src/views/ai/model-key.utils.ts');

test('模型配置导入导出不含密钥；导入只取类型正确的字段', () => {
  assert.equal(EXPORT_FIELDS.includes('key'), false);
  assert.equal(parseModelConfigJson('[1,2]'), null);
  assert.equal(parseModelConfigJson('null'), null);
  assert.equal(parseModelConfigJson('3'), null);
  assert.equal(parseModelConfigJson('{broken'), null);
  const values = parseModelConfigJson(
    JSON.stringify({
      modelName: 'M',
      key: 'sk-example-ignored',
      status: 'yes',
      deduct: 2,
      multimodalTypes: ['image_url', 3],
      capabilities: { vision: true },
      baseUrl: null,
    }),
  );
  assert.deepEqual(values, { modelName: 'M', deduct: 2, capabilities: { vision: true } });
  // 导入 "key": "" 不会清掉已存密钥：根本不应用 key
  assert.deepEqual(parseModelConfigJson('{"key":""}'), {});
});

test('测试连接 / 拉模型列表：明文可用；脱敏或空的只有已保存的模型可用', () => {
  assert.equal(isMaskedKey('abc****wxyz'), true);
  assert.equal(isMaskedKey('plain'), false);
  assert.equal(canUseKeyForRequest({ key: 'sk-plain', id: 0 }), true);
  assert.equal(canUseKeyForRequest({ key: 'abc****wxyz', id: 7 }), true);
  assert.equal(canUseKeyForRequest({ key: '', id: 7 }), true);
  assert.equal(canUseKeyForRequest({ key: 'abc****wxyz', id: 0 }), false);
  assert.equal(canUseKeyForRequest({ key: '   ', id: undefined }), false);
});

test('复制模型：名称加「 - 副本」、Key 清空，和其余字段在同一份表单值里；编辑沿用行上的值', () => {
  const row = {
    modelName: 'GPT',
    key: 'sk-****abcd',
    status: 1,
    protocol: '',
    multimodalTypes: ['image_url', 'video_url'],
    capabilities: '{"documentInput":true}',
  };
  const supported = (type, protocol) =>
    protocol === 'openai_chat_completions' && type !== 'video_url';
  const copied = modelFormValuesFromRow(row, supported, copiedModelOverrides(row));
  assert.equal(copied.modelName, 'GPT - 副本');
  assert.equal(copied.key, '');
  assert.equal(copied.protocol, 'openai_chat_completions');
  assert.deepEqual(copied.multimodalTypes, ['image_url', 'document']);
  assert.equal(copied.capabilities.vision, true);
  assert.equal(copied.capabilities.videoInput, false);
  assert.equal(copied.status, true);
  const edited = modelFormValuesFromRow(row, supported);
  assert.equal(edited.modelName, 'GPT');
  assert.equal(edited.key, 'sk-****abcd');
});
