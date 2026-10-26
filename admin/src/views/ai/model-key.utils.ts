import DOMPurify from 'dompurify';

type MultimodalType = 'image_url' | 'document' | 'video_url' | 'audio_url';
type NativeWebSearchMode = 'auto' | 'force' | 'off';
type ReasoningLevel = 'off' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh' | 'max';
type NativeWebSearchToolType =
  'web_search' | 'web_search_preview' | 'web_search_preview_2025_03_11';

interface GatewayCatalogItem {
  id: string;
  label?: string;
  providerKey: string;
  protocol: string;
  maxTokens?: number;
  multimodalTypes?: string[];
  capabilities?: Record<string, any>;
  defaultEndpointPath?: string;
  defaultAdditionalParams?: Record<string, any>;
}

interface GatewayProviderProfile {
  key: string;
  label: string;
  description?: string;
  protocol: string;
  baseUrl: string;
  endpointPath?: string;
  supportsRemoteModelList?: boolean;
  defaultMultimodalTypes?: string[];
  defaultCapabilities?: Record<string, any>;
  defaultAdditionalParams?: Record<string, any>;
  modelCatalog?: GatewayCatalogItem[];
}

/** 服务端当前装载的调用协议及其特性（来自 GET /models/gatewayProfiles） */
interface GatewayProtocolOption {
  value: string;
  label: string;
  supportsRemoteModelList: boolean;
  supportsNativeWebSearch: boolean;
  multimodalTypes: string[];
}

interface ModelOption {
  id: string;
  label: string;
}

const reasoningLevelOptions: Array<{ label: string; value: ReasoningLevel }> = [
  { label: '关闭', value: 'off' },
  { label: '极低', value: 'minimal' },
  { label: '低', value: 'low' },
  { label: '中', value: 'medium' },
  { label: '高', value: 'high' },
  { label: '超高', value: 'xhigh' },
  { label: '最高', value: 'max' },
];

const DEFAULT_REASONING_LEVELS: ReasoningLevel[] = ['medium'];
const DEFAULT_REASONING_LEVEL: ReasoningLevel = 'medium';

const normalizeReasoningLevel = (value: unknown): ReasoningLevel | undefined => {
  switch (
    String(value || '')
      .trim()
      .toLowerCase()
  ) {
    case 'off':
      return 'off';
    case 'minimal':
      return 'minimal';
    case 'low':
      return 'low';
    case 'medium':
      return 'medium';
    case 'high':
      return 'high';
    case 'xhigh':
      return 'xhigh';
    case 'max':
      return 'max';
    default:
      return undefined;
  }
};

const normalizeReasoningControl = (value: unknown) => {
  const input: Record<string, unknown> =
    value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  const requestedLevels = Array.isArray(input.levels) ? input.levels : [];
  const normalizedRequestedLevels = new Set(
    requestedLevels.map(normalizeReasoningLevel).filter(Boolean),
  );
  const levels = reasoningLevelOptions
    .map((item) => item.value)
    .filter((level) => normalizedRequestedLevels.has(level));
  const effectiveLevels = levels.length > 0 ? levels : [...DEFAULT_REASONING_LEVELS];
  const requestedDefault = normalizeReasoningLevel(input.defaultLevel);
  const defaultLevel =
    requestedDefault && effectiveLevels.includes(requestedDefault)
      ? requestedDefault
      : effectiveLevels.includes(DEFAULT_REASONING_LEVEL)
        ? DEFAULT_REASONING_LEVEL
        : effectiveLevels[0];

  return {
    ...input,
    levels: effectiveLevels,
    defaultLevel,
  };
};

const capabilitiesFromMultimodalTypes = (types: string[]) => ({
  streaming: true,
  toolCalling: true,
  usage: true,
  systemMessage: true,
  reasoning: 'delta',
  vision: types.includes('image_url'),
  documentInput: types.includes('document'),
  videoInput: types.includes('video_url'),
  audioInput: types.includes('audio_url'),
});

const applyProbedReasoningControl = (current: unknown, levels: ReasoningLevel[]) => {
  const previous: Record<string, unknown> = normalizeReasoningControl(current);
  const levelMap = previous.levelMap;
  return normalizeReasoningControl({
    ...previous,
    levels,
    ...(levelMap && typeof levelMap === 'object' && !Array.isArray(levelMap)
      ? {
          levelMap: Object.fromEntries(
            Object.entries(levelMap).filter(([level]) => levels.includes(level as ReasoningLevel)),
          ),
        }
      : {}),
  });
};

const normalizeCapabilities = (capabilities: unknown): Record<string, unknown> => {
  if (!capabilities) return {};
  if (typeof capabilities === 'string') {
    try {
      const parsed = JSON.parse(capabilities);
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
    } catch {
      return {};
    }
  }
  return typeof capabilities === 'object' && !Array.isArray(capabilities)
    ? { ...capabilities }
    : {};
};

const mergeCapabilitiesWithMultimodalTypes = (
  capabilities: Record<string, any> = {},
  types: string[] = [],
) => {
  const multimodalCapabilities = capabilitiesFromMultimodalTypes(types);
  return {
    ...multimodalCapabilities,
    ...normalizeCapabilities(capabilities),
    vision: multimodalCapabilities.vision,
    documentInput: multimodalCapabilities.documentInput,
    videoInput: multimodalCapabilities.videoInput,
    audioInput: multimodalCapabilities.audioInput,
  };
};

const multimodalTypesFromCapabilities = (capabilities: Record<string, any> = {}) => {
  const types: string[] = [];
  if (capabilities.vision) types.push('image_url');
  if (capabilities.documentInput) types.push('document');
  if (capabilities.videoInput) types.push('video_url');
  if (capabilities.audioInput) types.push('audio_url');
  return types;
};

/** 多模态类型的展示名；各协议支持哪些类型由服务端协议列表（gatewayProfiles.protocols）给出 */
const multimodalOptions: Array<{ label: string; value: MultimodalType }> = [
  { label: '图片解析', value: 'image_url' },
  { label: 'PDF 文档', value: 'document' },
  { label: '视频解析', value: 'video_url' },
  { label: '音频解析', value: 'audio_url' },
];

const nativeWebSearchModeOptions: Array<{ label: string; value: NativeWebSearchMode }> = [
  { label: '自动判断', value: 'auto' },
  { label: '强制搜索', value: 'force' },
];

const nativeWebSearchToolTypeOptions: Array<{ label: string; value: NativeWebSearchToolType }> = [
  { label: 'web_search（新版）', value: 'web_search' },
  { label: 'web_search_preview（兼容）', value: 'web_search_preview' },
  { label: 'web_search_preview_2025_03_11', value: 'web_search_preview_2025_03_11' },
];

const nativeWebSearchContextSizeOptions = [
  { label: '低', value: 'low' },
  { label: '中', value: 'medium' },
  { label: '高', value: 'high' },
] as const;

// JSON验证和格式化函数
const validateJSON = (value: string) => {
  if (!value || value.trim() === '') {
    // 允许空值
    return true;
  }
  try {
    JSON.parse(value);
    return true;
  } catch (error) {
    return false;
  }
};

const formatJSON = (value: string) => {
  if (!value || value.trim() === '') {
    return '';
  }
  try {
    const parsed = JSON.parse(value);
    return JSON.stringify(parsed, null, 2);
  } catch (error) {
    throw new Error('无效的JSON格式', { cause: error });
  }
};

/** 没有供应商专属参数时保持表单为空，避免把空对象误当成默认配置。 */
const stringifyAdditionalParams = (params?: Record<string, any>) =>
  params && Object.keys(params).length > 0 ? JSON.stringify(params, null, 2) : '';

/** 服务端探针结果 → 表单里的测试行（跳过 / 通过 / 未通过），汇总与应用都基于它 */
const probeResultRows = (
  tests: Array<Record<string, any>>,
  labelFor: (key: string) => string | undefined = () => undefined,
) =>
  tests.map((item) => ({
    key: item.key,
    label: item.label || labelFor(item.key) || item.key,
    capability: item.capability,
    value: item.value,
    status: (item.skipped ? 'skip' : item.ok ? 'success' : 'fail') as 'skip' | 'success' | 'fail',
    message: item.message || '',
  }));

const summarizeProbeApplication = (
  results: Array<{ capability?: string; status?: string; value?: string }>,
) => {
  const multimodalResults = results.filter((item) => item.capability === 'multimodal');
  const reasoningResults = results.filter((item) => item.capability === 'reasoning');
  const attemptedReasoningResults = reasoningResults.filter((item) => item.status !== 'skip');
  return {
    hasMultimodalResults: multimodalResults.length > 0,
    supportedMultimodalTypes: multimodalResults
      .filter((item) => item.status === 'success' && item.value)
      .map((item) => item.value as string),
    reasoningBlocked:
      attemptedReasoningResults.length > 0 &&
      !attemptedReasoningResults.some((item) => item.status === 'success' && item.value),
    supportedReasoningLevels: reasoningResults
      .filter((item) => item.status === 'success' && item.value)
      .map((item) => item.value as ReasoningLevel),
  };
};

// KEY脱敏函数
const maskKey = (key: string) => {
  if (!key) return '-';
  if (key.length <= 10) return '*'.repeat(key.length);
  // 显示前3位和后4位，中间用***代替
  return `${key.slice(0, 3)}${'*'.repeat(Math.min(key.length - 7, 20))}${key.slice(-4)}`;
};

/**
 * 导入导出模型配置的字段：不含密钥。列表回显的密钥是脱敏值，导出它没有意义；
 * 导入也从不改密钥——编辑已有模型时沿用已存的密钥，新建 / 复制时保持表单里自己填的
 */
const EXPORT_FIELDS = [
  'modelName',
  'modelAvatar',
  'status',
  'model',
  'isTokenBased',
  'tokenFeeRatio',
  'modelOrder',
  'baseUrl',
  'protocol',
  'endpointPath',
  'capabilities',
  'deduct',
  'multimodalTypes',
  'modelLimits',
  'maxModelTokens',
  'modelDescription',
  'systemPrompt',
  'systemPromptType',
  'additionalParams',
] as const;

/** 各字段导入时要求的类型：类型不对、null 的不应用 */
const CONFIG_FIELD_TYPES: Record<
  (typeof EXPORT_FIELDS)[number],
  'string' | 'number' | 'boolean' | 'object' | 'string[]'
> = {
  modelName: 'string',
  modelAvatar: 'string',
  status: 'boolean',
  model: 'string',
  isTokenBased: 'boolean',
  tokenFeeRatio: 'number',
  modelOrder: 'number',
  baseUrl: 'string',
  protocol: 'string',
  endpointPath: 'string',
  capabilities: 'object',
  deduct: 'number',
  multimodalTypes: 'string[]',
  modelLimits: 'number',
  maxModelTokens: 'number',
  modelDescription: 'string',
  systemPrompt: 'string',
  systemPromptType: 'number',
  additionalParams: 'string',
};

function matchesFieldType(
  value: unknown,
  type: (typeof CONFIG_FIELD_TYPES)[keyof typeof CONFIG_FIELD_TYPES],
) {
  if (type === 'string[]')
    return Array.isArray(value) && value.every((item) => typeof item === 'string');
  if (type === 'object')
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
  if (type === 'number') return typeof value === 'number' && Number.isFinite(value);
  return typeof value === type;
}

/**
 * 解析导入的模型配置 JSON：必须是对象；只取导出字段里类型正确的值（不含密钥），其余忽略。
 * 不是对象（数组、null、数字等）或 JSON 本身不合法时返回 null
 */
function parseModelConfigJson(text: string): Record<string, unknown> | null {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return null;
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) return null;
  const values: Record<string, unknown> = {};
  for (const field of EXPORT_FIELDS) {
    const value = (data as Record<string, unknown>)[field];
    if (value !== undefined && matchesFieldType(value, CONFIG_FIELD_TYPES[field]))
      values[field] = value;
  }
  return values;
}

/** 管理端回显的密钥是脱敏值（含 ****） */
const isMaskedKey = (value: unknown) => typeof value === 'string' && value.includes('****');

/**
 * 测试连接、拉取远端模型列表能不能发：明文密钥直接用；脱敏或空的只有已保存的模型（有 id）才行，
 * 由服务端换成已存的密钥；新建 / 复制出来的模型必须先填写
 */
function canUseKeyForRequest(input: { key: unknown; id?: number | null }): boolean {
  const key = typeof input.key === 'string' ? input.key.trim() : '';
  if (key && !isMaskedKey(key)) return true;
  return Number(input.id) > 0;
}

// SVG 源码检测和处理
const isSvgCode = (content: string): boolean => {
  if (!content) return false;
  const trimmed = content.trim();
  return trimmed.startsWith('<svg') && trimmed.includes('</svg>');
};

const isSvgUrl = (url: string): boolean => {
  if (!url) return false;
  const urlWithoutQuery = url.split('?')[0].toLowerCase();
  return urlWithoutQuery.endsWith('.svg');
};

const sanitizeSvg = (svgText: string): string => {
  // 用 DOMPurify 的 SVG profile 做白名单清洗（正则清洗可被无引号事件属性等绕过）
  svgText = DOMPurify.sanitize(svgText, {
    USE_PROFILES: { svg: true, svgFilters: true },
    FORBID_TAGS: ['foreignObject'],
  });

  // 确保 SVG 有合适的尺寸
  if (!svgText.includes('width=') && !svgText.includes('height=')) {
    svgText = svgText.replace(/<svg/u, '<svg width="24" height="24"');
  }

  return svgText;
};

/** 目录模型 / 内置模型表 / 探针结果写回表单时会改动的字段 */
interface ModelFormPatch {
  modelName?: string;
  baseUrl?: string;
  endpointPath?: string;
  protocol?: string;
  additionalParams?: string;
  maxModelTokens?: number;
  multimodalTypes?: string[];
  capabilities?: Record<string, any>;
}

/** 计算写回补丁时需要读取的当前表单字段 */
interface ModelFormSnapshot {
  protocol: string;
  baseUrl: string;
  endpointPath: string;
  multimodalTypes: string[];
  capabilities: Record<string, any>;
}

interface BuiltinModelInfo {
  maxTokens?: number;
  multimodalTypes?: string[];
}

/** 某个协议是否支持某种多模态类型；补丁里协议可能随目录模型一起切换，所以要显式传协议 */
type MultimodalTypeFilter = (type: string, protocol: string) => boolean;

/** 能力对象统一带规范化后的 reasoningControl，表单与提交载荷都走这一层 */
const withReasoningControl = (capabilities: Record<string, any> = {}) => ({
  ...capabilities,
  reasoningControl: normalizeReasoningControl(capabilities.reasoningControl),
});

/**
 * 编辑 / 复制模型时由列表行生成的表单值：多模态（行上的与能力里的合并去重）按协议过滤后并进能力，
 * 能力规范化推理控制。overrides 在同一份值里覆盖（如复制时的名称与清空的 Key），表单一次写入，
 * 不会被另一处延后的赋值冲掉
 */
const modelFormValuesFromRow = (
  row: Record<string, any>,
  isSupported: MultimodalTypeFilter,
  overrides: Record<string, unknown> = {},
) => {
  const protocol = row.protocol || 'openai_chat_completions';
  const rowCapabilities = normalizeCapabilities(row.capabilities);
  const rowMultimodalTypes: string[] = Array.isArray(row.multimodalTypes)
    ? row.multimodalTypes
    : [];
  const multimodalTypes = Array.from(
    new Set([...rowMultimodalTypes, ...multimodalTypesFromCapabilities(rowCapabilities)]),
  ).filter((type) => isSupported(type, protocol));
  return {
    modelName: row.modelName,
    key: row.key,
    status: Boolean(row.status),
    model: row.model,
    modelOrder: row.modelOrder,
    baseUrl: row.baseUrl,
    protocol,
    endpointPath: row.endpointPath || '',
    deduct: row.deduct,
    maxModelTokens: row.maxModelTokens,
    modelAvatar: row.modelAvatar,
    isTokenBased: Boolean(row.isTokenBased),
    tokenFeeRatio: row.tokenFeeRatio,
    multimodalTypes,
    capabilities: withReasoningControl(
      mergeCapabilitiesWithMultimodalTypes(rowCapabilities, multimodalTypes),
    ),
    modelLimits: row.modelLimits,
    modelDescription: row.modelDescription,
    systemPrompt: row.systemPrompt,
    systemPromptType: row.systemPromptType,
    additionalParams: row.additionalParams,
    ...overrides,
  };
};

/** 复制模型时覆盖的字段：名称加「 - 副本」；列表里的 Key 是脱敏值，不能沿用，清空要求重新填写 */
const copiedModelOverrides = (row: { modelName?: string }) => ({
  modelName: `${row.modelName} - 副本`,
  key: '',
});

/** 去重并只保留当前协议支持的多模态类型 */
const normalizeSupportedMultimodalTypes = (
  types: string[] = [],
  isSupported: (type: string) => boolean,
) => Array.from(new Set(types)).filter((type) => isSupported(type));

/**
 * 选中网关目录模型：名称取 label 回落 id；命中服务商档案时带上其地址 / 路径（档案为空则保留表单现值）；
 * 目录项自带的协议、默认路径、附加参数、上限覆盖档案默认；多模态按协议过滤后合并进能力并规范化推理控制。
 */
const buildCatalogModelPatch = (
  form: ModelFormSnapshot,
  modelInfo: GatewayCatalogItem,
  profiles: GatewayProviderProfile[],
  isSupported: MultimodalTypeFilter,
): { patch: ModelFormPatch; profileKey?: string } => {
  const profile = profiles.find((item) => item.key === modelInfo.providerKey);
  const patch: ModelFormPatch = { modelName: modelInfo.label || modelInfo.id };
  if (profile) {
    patch.baseUrl = profile.baseUrl || form.baseUrl;
    patch.endpointPath = profile.endpointPath || form.endpointPath;
  }
  if (modelInfo.protocol) {
    patch.protocol = modelInfo.protocol;
  }
  if (modelInfo.defaultEndpointPath !== undefined) {
    patch.endpointPath = modelInfo.defaultEndpointPath;
  }
  patch.additionalParams = stringifyAdditionalParams(
    modelInfo.defaultAdditionalParams || profile?.defaultAdditionalParams,
  );
  if (modelInfo.maxTokens) {
    patch.maxModelTokens = modelInfo.maxTokens;
  }
  // 多模态按补丁生效后的协议过滤（原实现先写回 protocol 再过滤）
  const protocol = patch.protocol ?? form.protocol;
  patch.multimodalTypes = normalizeSupportedMultimodalTypes(
    modelInfo.multimodalTypes || [],
    (type) => isSupported(type, protocol),
  );
  patch.capabilities = withReasoningControl(
    mergeCapabilitiesWithMultimodalTypes(modelInfo.capabilities || {}, patch.multimodalTypes),
  );
  return { patch, profileKey: profile?.key };
};

/** 目录里没有时回落内置模型表：只改多模态、上限，并把多模态合并进现有能力 */
const buildBuiltinModelPatch = (
  form: ModelFormSnapshot,
  modelInfo: BuiltinModelInfo,
  isSupported: MultimodalTypeFilter,
): ModelFormPatch => {
  const multimodalTypes = normalizeSupportedMultimodalTypes(
    modelInfo.multimodalTypes || [],
    (type) => isSupported(type, form.protocol),
  );
  const patch: ModelFormPatch = { multimodalTypes };
  if (modelInfo.maxTokens) {
    patch.maxModelTokens = modelInfo.maxTokens;
  }
  patch.capabilities = withReasoningControl(
    mergeCapabilitiesWithMultimodalTypes(form.capabilities, multimodalTypes),
  );
  return patch;
};

/**
 * 把探针通过项应用到表单：推理档位全部未通过时不应用任何结果（返回 null）；
 * 有多模态结果时以通过的类型覆盖，否则保留现值；通过的推理档位只收窄现有推理控制。
 */
const buildProbeApplicationPatch = (
  form: ModelFormSnapshot,
  summary: ReturnType<typeof summarizeProbeApplication>,
): ModelFormPatch | null => {
  if (summary.reasoningBlocked) return null;
  const multimodalTypes = summary.hasMultimodalResults
    ? summary.supportedMultimodalTypes
    : form.multimodalTypes;
  const capabilities: Record<string, any> = { ...form.capabilities };
  if (summary.supportedReasoningLevels.length > 0) {
    capabilities.reasoningControl = applyProbedReasoningControl(
      form.capabilities.reasoningControl,
      summary.supportedReasoningLevels,
    );
  }
  return {
    multimodalTypes,
    capabilities: withReasoningControl(
      mergeCapabilitiesWithMultimodalTypes(capabilities, multimodalTypes),
    ),
  };
};

export {
  EXPORT_FIELDS,
  canUseKeyForRequest,
  copiedModelOverrides,
  modelFormValuesFromRow,
  isMaskedKey,
  parseModelConfigJson,
  applyProbedReasoningControl,
  buildBuiltinModelPatch,
  buildCatalogModelPatch,
  buildProbeApplicationPatch,
  capabilitiesFromMultimodalTypes,
  formatJSON,
  isSvgCode,
  isSvgUrl,
  maskKey,
  mergeCapabilitiesWithMultimodalTypes,
  multimodalOptions,
  multimodalTypesFromCapabilities,
  nativeWebSearchContextSizeOptions,
  nativeWebSearchModeOptions,
  nativeWebSearchToolTypeOptions,
  normalizeCapabilities,
  normalizeReasoningControl,
  normalizeSupportedMultimodalTypes,
  probeResultRows,
  reasoningLevelOptions,
  sanitizeSvg,
  stringifyAdditionalParams,
  summarizeProbeApplication,
  validateJSON,
  withReasoningControl,
};
export type {
  ModelFormPatch,
  ModelFormSnapshot,
  GatewayCatalogItem,
  GatewayProtocolOption,
  GatewayProviderProfile,
  ModelOption,
  ReasoningLevel,
};
