import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  applyProbedReasoningControl,
  buildBuiltinModelPatch,
  buildCatalogModelPatch,
  buildProbeApplicationPatch,
  formatJSON,
  maskKey,
  mergeCapabilitiesWithMultimodalTypes,
  normalizeCapabilities,
  normalizeReasoningControl,
  probeResultRows,
  stringifyAdditionalParams,
  summarizeProbeApplication,
  validateJSON,
} from '../src/views/ai/model-key.utils.ts';

test('key previews never expose a complete configured key, including short values', () => {
  for (const value of ['demo', 'test-value', 'synthetic-model-credential']) {
    const preview = maskKey(value);
    assert.notEqual(preview, value);
    assert.ok(preview.includes('*'));
  }
  assert.equal(maskKey(''), '-');
});

test('capability configuration accepts objects and rejects arrays or malformed JSON', () => {
  assert.deepEqual(normalizeCapabilities('{"vision":true}'), { vision: true });
  assert.deepEqual(normalizeCapabilities({ toolCalling: false }), { toolCalling: false });
  for (const value of ['["vision"]', ['vision'], '{broken', 3, null]) {
    assert.deepEqual(normalizeCapabilities(value), {});
  }
});

test('selected media capabilities are authoritative while other model options survive', () => {
  const saved = mergeCapabilitiesWithMultimodalTypes(
    { vision: true, audioInput: false, toolCalling: false },
    ['audio_url'],
  );
  assert.equal(saved.vision, false);
  assert.equal(saved.audioInput, true);
  assert.equal(saved.documentInput, false);
  assert.equal(saved.toolCalling, false);
});

test('reasoning defaults belong to the selected supported levels', () => {
  assert.deepEqual(
    normalizeReasoningControl({ levels: ['HIGH', 'low', 'high', 'unknown'], defaultLevel: 'max' }),
    {
      levels: ['low', 'high'],
      defaultLevel: 'low',
    },
  );
  assert.deepEqual(normalizeReasoningControl({ levels: [] }), {
    levels: ['medium'],
    defaultLevel: 'medium',
  });
});

test('JSON formatting preserves configuration values and rejects malformed input', () => {
  const value = '{"temperature":0,"labels":["demo"],"enabled":false}';
  assert.deepEqual(JSON.parse(formatJSON(value)), JSON.parse(value));
  assert.equal(validateJSON('{broken'), false);
  assert.throws(() => formatJSON('{broken'), /无效的JSON格式/);
});

test('additional params stay blank unless a provider-specific value exists', () => {
  assert.equal(stringifyAdditionalParams(), '');
  assert.equal(stringifyAdditionalParams({}), '');
  assert.deepEqual(JSON.parse(stringifyAdditionalParams({ top_p: 0.8 })), { top_p: 0.8 });
});

test('probe application blocks all mutations when every selected reasoning level fails', () => {
  assert.deepEqual(
    summarizeProbeApplication([
      { capability: 'multimodal', status: 'success', value: 'image_url' },
      { capability: 'reasoning', status: 'fail', value: 'low' },
      { capability: 'reasoning', status: 'fail', value: 'medium' },
    ]),
    {
      hasMultimodalResults: true,
      supportedMultimodalTypes: ['image_url'],
      reasoningBlocked: true,
      supportedReasoningLevels: [],
    },
  );
});

test('skipped reasoning levels do not block applying an independently verified media result', () => {
  assert.deepEqual(
    summarizeProbeApplication([
      { capability: 'multimodal', status: 'success', value: 'image_url' },
      { capability: 'reasoning', status: 'skip', value: 'off' },
      { capability: 'reasoning', status: 'skip', value: 'medium' },
    ]),
    {
      hasMultimodalResults: true,
      supportedMultimodalTypes: ['image_url'],
      reasoningBlocked: false,
      supportedReasoningLevels: [],
    },
  );
});

test('probe application preserves successful provider mappings and drops failed levels', () => {
  const current = {
    levels: ['off', 'low', 'high'],
    defaultLevel: 'low',
    levelMap: { off: 'none', low: 'low', high: 'high' },
  };
  const applied = applyProbedReasoningControl(current, ['off', 'high']);
  assert.deepEqual(applied, {
    levels: ['off', 'high'],
    defaultLevel: 'off',
    levelMap: { off: 'none', high: 'high' },
  });
  assert.equal(current.levelMap.low, 'low');
  assert.deepEqual(JSON.parse(JSON.stringify(applied)).levelMap, { off: 'none', high: 'high' });
});

// 协议 → 支持的多模态类型；目录模型可能带着另一种协议一起写回，过滤必须按生效后的协议
const PROTOCOL_MULTIMODAL = {
  openai_chat_completions: ['image_url', 'audio_url'],
  anthropic_messages: ['image_url', 'document'],
};
const supportsImageAndAudio = (type, protocol) =>
  (PROTOCOL_MULTIMODAL[protocol] || PROTOCOL_MULTIMODAL.openai_chat_completions).includes(type);
const formSnapshot = () => ({
  protocol: 'openai_chat_completions',
  baseUrl: 'https://current.example',
  endpointPath: '/current',
  multimodalTypes: ['image_url'],
  capabilities: { toolCalling: true, reasoningControl: { levels: ['low', 'high'] } },
});

test('selecting a catalog model fills the form from the catalog item and its provider profile', () => {
  const profiles = [
    {
      key: 'acme',
      label: 'Acme',
      protocol: 'openai_chat_completions',
      baseUrl: 'https://acme.example',
      endpointPath: '/v1/chat',
      defaultAdditionalParams: { temperature: 0.2 },
    },
  ];
  const { patch, profileKey } = buildCatalogModelPatch(
    formSnapshot(),
    {
      id: 'acme-large',
      label: 'Acme Large',
      providerKey: 'acme',
      protocol: 'anthropic_messages',
      maxTokens: 200000,
      multimodalTypes: ['image_url', 'document', 'video_url', 'image_url'],
      capabilities: { toolCalling: true },
    },
    profiles,
    supportsImageAndAudio,
  );
  assert.equal(profileKey, 'acme');
  assert.equal(patch.modelName, 'Acme Large');
  assert.equal(patch.baseUrl, 'https://acme.example');
  assert.equal(patch.endpointPath, '/v1/chat');
  assert.equal(patch.protocol, 'anthropic_messages');
  assert.equal(patch.maxModelTokens, 200000);
  assert.deepEqual(
    patch.multimodalTypes,
    ['image_url', 'document'],
    'deduplicated and filtered by the protocol that takes effect with the patch, not the previous one',
  );
  assert.equal(patch.additionalParams, JSON.stringify({ temperature: 0.2 }, null, 2));
  assert.equal(patch.capabilities.toolCalling, true);
  assert.equal(patch.capabilities.vision, true, 'vision follows the image_url multimodal type');
  assert.equal(patch.capabilities.documentInput, true, 'document is supported by the new protocol');
  assert.equal(
    patch.capabilities.videoInput,
    false,
    'unsupported video type does not grant videoInput',
  );
  assert.ok(
    patch.capabilities.reasoningControl,
    'capabilities always carry a normalized reasoningControl',
  );
});

test('catalog item defaults override the profile, and a missing profile keeps the current address', () => {
  const { patch, profileKey } = buildCatalogModelPatch(
    formSnapshot(),
    {
      id: 'solo-model',
      providerKey: 'unknown',
      protocol: '',
      defaultEndpointPath: '/custom',
      defaultAdditionalParams: { top_p: 1 },
    },
    [],
    supportsImageAndAudio,
  );
  assert.equal(profileKey, undefined);
  assert.equal(patch.modelName, 'solo-model', 'label falls back to id');
  assert.ok(
    !('baseUrl' in patch),
    'no profile: base url key is absent, Object.assign leaves the form value',
  );
  assert.equal(patch.endpointPath, '/custom');
  assert.ok(!('protocol' in patch), 'empty protocol is not applied');
  assert.ok(!('maxModelTokens' in patch));
  assert.equal(patch.additionalParams, JSON.stringify({ top_p: 1 }, null, 2));
  assert.deepEqual(patch.multimodalTypes, [], 'filtered by the unchanged current protocol');
});

test('a newly selected manual-thinking catalog entry starts with reasoning off', () => {
  const { patch } = buildCatalogModelPatch(
    formSnapshot(),
    {
      id: 'claude-sonnet-4-5',
      label: 'Claude Sonnet 4.5 (latest)',
      providerKey: 'anthropic_messages',
      protocol: 'anthropic_messages',
      maxTokens: 200000,
      multimodalTypes: ['image_url', 'document'],
      capabilities: {
        reasoning: 'summary',
        reasoningControl: { levels: ['off', 'low', 'medium', 'high'], defaultLevel: 'off' },
      },
    },
    [],
    supportsImageAndAudio,
  );
  assert.deepEqual(patch.capabilities.reasoningControl.levels, ['off', 'low', 'medium', 'high']);
  assert.equal(patch.capabilities.reasoningControl.defaultLevel, 'off');
});

test('re-probing a saved model keeps its default level while that level is still available', () => {
  // 已保存、没有推理档位的模型规范化为「中」；目录后来改成默认「关闭」不会覆盖它，重新探测也保留「中」
  const saved = normalizeReasoningControl(undefined);
  assert.equal(saved.defaultLevel, 'medium');
  const applied = applyProbedReasoningControl(saved, ['off', 'low', 'medium', 'high']);
  assert.deepEqual(applied.levels, ['off', 'low', 'medium', 'high']);
  assert.equal(applied.defaultLevel, 'medium');
});

test('falling back to the built-in model list only touches limits and multimodal types', () => {
  const patch = buildBuiltinModelPatch(
    formSnapshot(),
    { maxTokens: 128000, multimodalTypes: ['image_url', 'video_url'] },
    supportsImageAndAudio,
  );
  assert.deepEqual(Object.keys(patch).sort(), [
    'capabilities',
    'maxModelTokens',
    'multimodalTypes',
  ]);
  assert.equal(patch.maxModelTokens, 128000);
  assert.deepEqual(patch.multimodalTypes, ['image_url']);
  assert.equal(patch.capabilities.toolCalling, true, 'existing capabilities are kept');
  assert.equal(patch.capabilities.vision, true);
});

test('probe results are applied only when reasoning is not fully blocked', () => {
  const blocked = buildProbeApplicationPatch(formSnapshot(), {
    hasMultimodalResults: true,
    supportedMultimodalTypes: ['image_url'],
    reasoningBlocked: true,
    supportedReasoningLevels: [],
  });
  assert.equal(blocked, null);

  const applied = buildProbeApplicationPatch(formSnapshot(), {
    hasMultimodalResults: true,
    supportedMultimodalTypes: ['audio_url'],
    reasoningBlocked: false,
    supportedReasoningLevels: ['low'],
  });
  assert.deepEqual(applied.multimodalTypes, ['audio_url']);
  assert.deepEqual(applied.capabilities.reasoningControl.levels, ['low']);
  assert.equal(applied.capabilities.audioInput, true);
  assert.equal(
    applied.capabilities.vision,
    false,
    'image support is dropped when the probe did not confirm it',
  );
  assert.equal(applied.capabilities.toolCalling, true);

  const noMultimodal = buildProbeApplicationPatch(formSnapshot(), {
    hasMultimodalResults: false,
    supportedMultimodalTypes: [],
    reasoningBlocked: false,
    supportedReasoningLevels: [],
  });
  assert.deepEqual(
    noMultimodal.multimodalTypes,
    ['image_url'],
    'without multimodal probes the current types stay',
  );
});

// 服务端用真实的测试连接编排（只替换网络）产出的 Claude 探针结果，见
// server/src/packs/model-anthropic/anthropic-connection-probe.spec.ts；这里按后台真实的转换、汇总、应用逻辑断言写回结果
const anthropicProbeResults = JSON.parse(
  readFileSync(
    new URL(
      '../../server/src/packs/model-anthropic/anthropic-probe-results.fixture.json',
      import.meta.url,
    ),
    'utf8',
  ),
);
const ADAPTIVE_ALL = ['off', 'low', 'medium', 'high', 'xhigh', 'max'];
const MANUAL_LEVELS = ['off', 'low', 'medium', 'high'];
const applyClaudeProbe = (scenario, reasoningControl) => {
  const form = {
    protocol: 'anthropic_messages',
    baseUrl: 'https://api.anthropic.com',
    endpointPath: '/v1/messages',
    multimodalTypes: ['image_url', 'document'],
    capabilities: {
      reasoning: 'summary',
      reasoningControl: normalizeReasoningControl(reasoningControl),
    },
  };
  return buildProbeApplicationPatch(
    form,
    summarizeProbeApplication(probeResultRows(anthropicProbeResults[scenario])),
  );
};

test('server probe results become pass / fail / skip rows with readable labels', () => {
  const rows = probeResultRows(
    [
      { key: 'text', label: '文本对话', capability: 'text', ok: true },
      {
        key: 'multimodal:image_url',
        capability: 'multimodal',
        value: 'image_url',
        ok: false,
        message: '未识别',
      },
      { key: 'reasoning:xhigh', capability: 'reasoning', value: 'xhigh', ok: false, skipped: true },
    ],
    (key) => (key === 'multimodal:image_url' ? '图片解析' : undefined),
  );
  assert.deepEqual(
    rows.map((row) => [row.key, row.label, row.status, row.message]),
    [
      ['text', '文本对话', 'success', ''],
      ['multimodal:image_url', '图片解析', 'fail', '未识别'],
      ['reasoning:xhigh', 'reasoning:xhigh', 'skip', ''],
    ],
  );
});

test('Claude probe results write back exactly the levels the model family supports', () => {
  const cases = [
    // [场景, 起始推理档位（目录新选或已保存）, 写回后的档位, 默认档位]
    [
      'opus-5-5',
      { levels: ['low', 'medium', 'high', 'xhigh', 'max'], defaultLevel: 'medium' },
      ['low', 'medium', 'high', 'xhigh', 'max'],
      'medium',
    ],
    ['sonnet-4-5', { levels: MANUAL_LEVELS, defaultLevel: 'off' }, MANUAL_LEVELS, 'off'],
    // 已保存、没有推理档位（规范化为「中」）的手动思考模型：重新探测后默认仍是「中」
    ['sonnet-4-5', undefined, MANUAL_LEVELS, 'medium'],
    [
      'opus-5-adaptive-medium-in-params',
      { levels: ADAPTIVE_ALL, defaultLevel: 'medium' },
      ADAPTIVE_ALL,
      'medium',
    ],
    [
      'sonnet-4-5-disabled-in-params',
      { levels: MANUAL_LEVELS, defaultLevel: 'off' },
      MANUAL_LEVELS,
      'off',
    ],
    [
      'sonnet-4-6-disabled-in-params',
      { levels: ['off', 'low', 'medium', 'high', 'max'], defaultLevel: 'medium' },
      ['off', 'low', 'medium', 'high', 'max'],
      'medium',
    ],
    [
      'sonnet-4-5-large-budget-in-params',
      { levels: MANUAL_LEVELS, defaultLevel: 'off' },
      MANUAL_LEVELS,
      'off',
    ],
  ];
  for (const [scenario, start, levels, defaultLevel] of cases) {
    const patch = applyClaudeProbe(scenario, start);
    assert.ok(patch, `${scenario}: probe result applies`);
    assert.deepEqual(patch.capabilities.reasoningControl.levels, levels, scenario);
    assert.equal(patch.capabilities.reasoningControl.defaultLevel, defaultLevel, scenario);
    assert.deepEqual(patch.multimodalTypes, ['image_url', 'document'], scenario);
  }
});

test('Claude models whose reasoning levels are all skipped keep their existing reasoning settings', () => {
  for (const scenario of ['claude-3-5', 'unknown-model']) {
    const rows = probeResultRows(anthropicProbeResults[scenario]);
    assert.ok(
      rows.filter((row) => row.capability === 'reasoning').every((row) => row.status === 'skip'),
    );
    const patch = applyClaudeProbe(scenario, undefined);
    // 全部跳过不算推理被阻断：多模态照常应用，推理控制保持原值（缺省规范化为「中」）
    assert.deepEqual(patch.capabilities.reasoningControl.levels, ['medium'], scenario);
    assert.equal(patch.capabilities.reasoningControl.defaultLevel, 'medium', scenario);
  }
});
