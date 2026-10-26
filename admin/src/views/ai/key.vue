<script lang="ts" setup>
  import ApiModels from '@/api/modules/models';
  import { getDocUrl } from '@/utils/docUrl';
  import { usePageDoc } from '@/utils/composables/usePageDoc';
  import usePagedTable from '@/utils/composables/usePagedTable';
  import { createModelStatusToggles } from './modelStatusToggle';
  import useAssetUpload, { getUploadedUrl } from '@/utils/composables/useAssetUpload';
  import { resolvePageAfterRemoval } from '@/utils/pagination';
  import type {
    FormInstance,
    FormRules,
    UploadProps,
    UploadRequestHandler,
    UploadRequestOptions,
  } from 'element-plus';
  import { ElMessage, ElMessageBox } from 'element-plus';
  import { computed, nextTick, onMounted, reactive, ref, watch } from 'vue';

  import { MODEL_LIST, type ModelInfo } from '@/constants/model-list';
  import { QUESTION_STATUS_OPTIONS } from '@/constants/index';
  import type { FilterField } from '@/components/FilterBar/types';
  import {
    EXPORT_FIELDS,
    canUseKeyForRequest,
    copiedModelOverrides,
    isMaskedKey,
    modelFormValuesFromRow,
    parseModelConfigJson,
    buildBuiltinModelPatch,
    buildCatalogModelPatch,
    buildProbeApplicationPatch,
    probeResultRows,
    formatJSON,
    isSvgCode,
    mergeCapabilitiesWithMultimodalTypes,
    multimodalOptions,
    nativeWebSearchContextSizeOptions,
    nativeWebSearchModeOptions,
    nativeWebSearchToolTypeOptions,
    normalizeCapabilities,
    normalizeReasoningControl,
    normalizeSupportedMultimodalTypes,
    reasoningLevelOptions,
    sanitizeSvg,
    stringifyAdditionalParams,
    summarizeProbeApplication,
    validateJSON,
    withReasoningControl,
    type GatewayCatalogItem,
    type GatewayProtocolOption,
    type GatewayProviderProfile,
    type ModelOption,
    type ReasoningLevel,
  } from './model-key.utils';

  const filterFields: FilterField[] = [
    {
      key: 'status',
      label: '显示状态',
      type: 'select',
      placeholder: '请选择模型的显示状态',
      options: QUESTION_STATUS_OPTIONS,
    },
  ];

  // FilterBar 清空筛选时会写入 ''，这里统一归一为 null，保持查询参数语义不变
  function handleFiltersUpdate(value: Record<string, any>) {
    Object.assign(formInline, value);
    if (formInline.status === ('' as any)) {
      formInline.status = null;
    }
  }

  const visible = ref(false);

  const docUrl = computed(() => getDocUrl('/configuration/ai/model-settings'));
  usePageDoc(docUrl);

  const formInline = reactive({
    model: '',
    page: 1,
    size: 20,
    status: null,
  });

  const status = computed({
    get: () => formInline.status ?? undefined,
    set: (val) => {
      formInline.status = val ?? null;
    },
  });

  const formPackageRef = ref<FormInstance>();
  const activeModelKeyId = ref(0);

  const formPackage = reactive({
    modelName: '',
    key: '',
    modelAvatar: '',
    status: true,
    model: '',
    isTokenBased: false,
    tokenFeeRatio: 1000,
    modelOrder: 0,
    deduct: 1,
    multimodalTypes: [] as string[],
    modelLimits: 50,
    maxModelTokens: 64000,
    modelDescription: '',
    systemPrompt: '',
    systemPromptType: 0,
    additionalParams: '',
    protocol: 'openai_chat_completions',
    baseUrl: '',
    endpointPath: '',
    capabilities: {} as Record<string, any>,
  });

  /** 调用协议列表来自服务端已装载的协议包，内核只保证 OpenAI Chat Completions 基线 */
  const gatewayProtocols = ref<GatewayProtocolOption[]>([]);
  const protocolOptions = computed(() =>
    gatewayProtocols.value.map((item) => ({
      label: item.label,
      value: item.value,
      disabled: false,
    })),
  );
  const currentProtocol = computed(() =>
    gatewayProtocols.value.find((item) => item.value === formPackage.protocol),
  );

  const gatewayProfiles = ref<GatewayProviderProfile[]>([]);
  const gatewayCatalog = ref<GatewayCatalogItem[]>([]);
  const selectedProviderProfileKey = ref('');
  const selectedProviderProfile = computed(
    () =>
      gatewayProfiles.value.find((item) => item.key === selectedProviderProfileKey.value) || null,
  );

  const requestUrlPreview = ref('');
  const requestUrlWarning = ref('');
  const actualRequestUrl = computed(() => requestUrlPreview.value);

  // 协议列表尚未加载时不做过滤，避免把已保存的多模态选项误清掉
  const isMultimodalTypeSupportedFor = (type: string, protocol: string) =>
    gatewayProtocols.value.length === 0 ||
    Boolean(
      gatewayProtocols.value
        .find((item) => item.value === protocol)
        ?.multimodalTypes.includes(type),
    );
  const isMultimodalTypeSupported = (type: string) =>
    isMultimodalTypeSupportedFor(type, formPackage.protocol);

  const multimodalLabelMap = computed(() =>
    multimodalOptions.reduce<Record<string, string>>((map, option) => {
      map[option.value] = option.label;
      return map;
    }, {}),
  );

  const buildModelGatewayPayload = () => ({
    // 列表回显的密钥是脱敏值；带上 id 让服务端在测试连接 / 拉取模型时用库里的真实密钥
    id: activeModelKeyId.value || undefined,
    protocol: formPackage.protocol || 'openai_chat_completions',
    model: formPackage.model,
    key: formPackage.key,
    baseUrl: formPackage.baseUrl,
    endpointPath: formPackage.endpointPath || undefined,
    capabilities: withReasoningControl(
      mergeCapabilitiesWithMultimodalTypes(formPackage.capabilities, formPackage.multimodalTypes),
    ),
    multimodalTypes: formPackage.multimodalTypes,
    additionalParams: formPackage.additionalParams,
  });

  const supportsNativeWebSearch = computed(
    () => currentProtocol.value?.supportsNativeWebSearch === true,
  );

  const nativeWebSearchConfig = computed(() => {
    if (
      !formPackage.capabilities.nativeTools ||
      typeof formPackage.capabilities.nativeTools !== 'object'
    ) {
      formPackage.capabilities.nativeTools = {};
    }
    if (!formPackage.capabilities.nativeTools.webSearch) {
      formPackage.capabilities.nativeTools.webSearch = {
        enabled: false,
        provider: 'openai',
        mode: 'auto',
        toolType: 'web_search',
        searchContextSize: 'medium',
        includeSources: true,
      };
    }
    if (typeof formPackage.capabilities.nativeTools.webSearch.includeSources !== 'boolean') {
      formPackage.capabilities.nativeTools.webSearch.includeSources = true;
    }
    return formPackage.capabilities.nativeTools.webSearch;
  });

  const selectedReasoningLevels = computed<ReasoningLevel[]>({
    get: () => normalizeReasoningControl(formPackage.capabilities.reasoningControl).levels,
    set: (levels) => {
      formPackage.capabilities.reasoningControl = normalizeReasoningControl({
        ...formPackage.capabilities.reasoningControl,
        levels,
      });
    },
  });

  const defaultReasoningLevel = computed<ReasoningLevel>({
    get: () => normalizeReasoningControl(formPackage.capabilities.reasoningControl).defaultLevel,
    set: (defaultLevel) => {
      formPackage.capabilities.reasoningControl = normalizeReasoningControl({
        ...formPackage.capabilities.reasoningControl,
        levels: selectedReasoningLevels.value,
        defaultLevel,
      });
    },
  });

  const selectedReasoningLevelOptions = computed(() =>
    reasoningLevelOptions.filter((item) => selectedReasoningLevels.value.includes(item.value)),
  );

  let requestUrlPreviewRequestId = 0;
  async function refreshRequestUrlPreview() {
    const requestId = ++requestUrlPreviewRequestId;
    requestUrlPreview.value = '';
    requestUrlWarning.value = '';
    const payload = buildModelGatewayPayload();
    if (!payload.baseUrl) return;
    try {
      const res = await ApiModels.previewRequestUrl(payload);
      // 丢弃迟到的旧响应，避免切换配置后被旧预览覆盖
      if (requestId !== requestUrlPreviewRequestId) return;
      requestUrlPreview.value = res.data?.url || '';
      requestUrlWarning.value = (res.data?.warnings || []).join(', ');
    } catch (error: any) {
      if (requestId !== requestUrlPreviewRequestId) return;
      requestUrlWarning.value = error?.message || '请求地址预览失败';
    }
  }

  // 格式化附加参数的函数
  const handleFormatAdditionalParams = () => {
    try {
      if (formPackage.additionalParams && formPackage.additionalParams.trim()) {
        formPackage.additionalParams = formatJSON(formPackage.additionalParams);
        ElMessage.success('JSON格式化成功');
      } else {
        ElMessage.info('请先输入JSON内容');
      }
    } catch (error) {
      ElMessage.error(error instanceof Error ? error.message : 'JSON格式化失败');
    }
  };

  const findCatalogModel = (modelId: string) => {
    const selectedProfileModel = selectedProviderProfile.value?.modelCatalog?.find(
      (item) => item.id === modelId,
    );
    if (selectedProfileModel) return selectedProfileModel;

    return gatewayCatalog.value.find((item) => item.id === modelId) || null;
  };

  const applyCatalogModel = (modelInfo: GatewayCatalogItem) => {
    const { patch, profileKey } = buildCatalogModelPatch(
      formPackage,
      modelInfo,
      gatewayProfiles.value,
      isMultimodalTypeSupportedFor,
    );
    if (profileKey) {
      selectedProviderProfileKey.value = profileKey;
    }
    Object.assign(formPackage, patch);
  };

  /* 选中模型时自动填充能力信息 */
  const handleModelChange = (modelId: string) => {
    const catalogInfo = findCatalogModel(modelId);
    if (catalogInfo) {
      applyCatalogModel(catalogInfo);
      ElMessage.success('已自动识别模型能力');
      return;
    }

    const modelInfo: ModelInfo | undefined = MODEL_LIST.find((m) => m.id === modelId);
    if (!modelInfo) return;

    Object.assign(
      formPackage,
      buildBuiltinModelPatch(formPackage, modelInfo, isMultimodalTypeSupportedFor),
    );
    ElMessage.success('已自动识别模型能力');
  };

  /* ========== 模型能力测试 ========== */
  interface TestItem {
    key: string;
    label: string;
    capability?: 'text' | 'multimodal' | 'reasoning';
    value?: string;
    status: 'pending' | 'running' | 'success' | 'fail' | 'skip';
    message: string;
  }

  const testLoading = ref(false);
  const testResults = ref<TestItem[]>([]);

  const handleTestModel = async () => {
    const payload = buildModelGatewayPayload();
    if (!payload.baseUrl || !payload.model || !canUseKeyForRequest(payload)) {
      ElMessage.warning('请先填写基础地址、Key 和模型名称');
      return;
    }

    const probeCount =
      1 + (currentProtocol.value?.multimodalTypes.length || 0) + reasoningLevelOptions.length;
    try {
      await ElMessageBox.confirm(
        `将向当前模型发起最多 ${probeCount} 次真实请求，自动探测文本、当前协议可发送的多模态能力和全部推理档位，可能产生少量 Token 与费用。是否继续？`,
        '真实探针测试',
        {
          confirmButtonText: '开始测试',
          cancelButtonText: '取消',
          type: 'warning',
        },
      );
    } catch {
      return;
    }

    testLoading.value = true;
    testResults.value = [{ key: 'text', label: '文本对话', status: 'running', message: '' }];
    try {
      const response = await ApiModels.testConnection(payload);
      const tests = response.data?.tests || [];
      if (Array.isArray(tests) && tests.length > 0) {
        testResults.value = probeResultRows(tests, (key) => multimodalLabelMap.value[key]);
      } else {
        testResults.value[0].status = 'success';
        testResults.value[0].message = '后端测试通过';
      }
    } catch (error: any) {
      testResults.value[0].status = 'fail';
      testResults.value[0].message = error?.message || '后端测试失败';
    } finally {
      testLoading.value = false;
    }
  };

  const applyProbeResults = () => {
    const patch = buildProbeApplicationPatch(
      formPackage,
      summarizeProbeApplication(testResults.value),
    );
    if (!patch) {
      ElMessage.warning('推理档位全部未通过，未应用任何结果；请调整配置后重试');
      return;
    }
    Object.assign(formPackage, patch);
    ElMessage.success('已把探针通过项应用到表单，请确认后保存');
  };

  const rules = reactive<FormRules>({
    modelName: [{ required: true, message: '请填写您的模型名称', trigger: 'blur' }],
    key: [{ required: false, message: '请填写您的调用模型key', trigger: 'blur' }],
    // secret: [
    //   { required: true, message: '请填写您的调用模型的secret', trigger: 'blur' },
    // ],
    status: [{ required: true, message: '请选择key的显示状态', trigger: 'change' }],
    // isDraw: [
    //   {
    //     required: true,
    //     message: '请选择当前key是否作为基础绘画key',
    //     trigger: 'change',
    //   },
    // ],
    multimodalTypes: [
      {
        required: false,
        message: '请选择模型支持的多模态类型',
        trigger: 'change',
      },
    ],
    isTokenBased: [
      {
        required: true,
        message: '请选择当前key是否基于token计费',
        trigger: 'change',
      },
    ],
    tokenFeeRatio: [{ required: false, message: 'token计费比例', trigger: 'change' }],
    model: [
      {
        required: true,
        message: '请选择当前key需要绑定的模型',
        trigger: 'change',
      },
    ],
    modelOrder: [{ required: true, message: '请填写当前模型排序', trigger: 'blur' }],

    // keyWeight: [
    //   { required: true, message: '请填写key的权重值', trigger: 'blur' },
    // ],
    baseUrl: [{ required: false, message: '请填写模型地址', trigger: 'blur' }],
    modelAvatar: [
      {
        required: false,
        message: '请填写AI模型使用的头像, 不填写使用系统默认',
        trigger: 'blur',
      },
    ],
    deduct: [
      {
        required: true,
        message: '请填写当前模型扣费金额（需要是正整数）',
        trigger: 'blur',
      },
    ],
    modelLimits: [
      {
        required: true,
        message: '请填写模型调用频率限制',
        trigger: 'blur',
      },
    ],
    maxModelTokens: [
      {
        required: true,
        message: '请填写上下文长度',
        trigger: 'blur',
      },
    ],
    modelDescription: [
      {
        required: false,
        message: '请填写模型描述',
        trigger: 'blur',
      },
    ],
    isNetworkSearch: [
      {
        required: false,
        message: '请填写是否开启网络搜索',
        trigger: 'change',
      },
    ],
    additionalParams: [
      {
        required: false,
        validator: (rule, value, callback) => {
          if (!value || value.trim() === '') {
            callback();
            return;
          }
          if (!validateJSON(value)) {
            callback(new Error('请输入有效的JSON格式'));
            return;
          }
          callback();
        },
        trigger: ['blur', 'change'],
      },
    ],
  });

  function handlerCloseDialog(formEl: FormInstance | undefined) {
    activeModelKeyId.value = 0;
    remoteModels.value = [];
    selectedProviderProfileKey.value = '';
    testResults.value = [];
    testLoading.value = false;
    formEl?.resetFields();
  }

  /* 远程模型获取 */
  const remoteModels = ref<string[]>([]);
  const remoteModelsLoading = ref(false);
  const remoteModelsMessage = ref('');
  const remoteModelListSupported = computed(() => {
    if (selectedProviderProfile.value) {
      return Boolean(selectedProviderProfile.value.supportsRemoteModelList);
    }
    return currentProtocol.value?.supportsRemoteModelList === true;
  });

  const modelSelectOptions = computed<ModelOption[]>(() => {
    if (remoteModels.value.length > 0) {
      return remoteModels.value.map((id) => ({ id, label: id }));
    }

    const options = new Map<string, ModelOption>();
    const addOption = (id: string, label?: string) => {
      if (!id || options.has(id)) return;
      options.set(id, { id, label: label || id });
    };

    selectedProviderProfile.value?.modelCatalog?.forEach((item) => addOption(item.id, item.label));
    gatewayCatalog.value.forEach((item) => addOption(item.id, item.label));
    MODEL_LIST.forEach((item) => addOption(item.id, item.id));

    return Array.from(options.values());
  });

  const inferProviderProfileKey = (protocol: string, baseUrl: string, endpointPath: string) => {
    const normalizedBaseUrl = (baseUrl || '').replace(/\/+$/u, '');
    const normalizedEndpointPath = endpointPath || '';
    const exactMatch = gatewayProfiles.value.find(
      (profile) =>
        profile.protocol === protocol &&
        profile.baseUrl.replace(/\/+$/u, '') === normalizedBaseUrl &&
        (profile.endpointPath || '') === normalizedEndpointPath,
    );
    if (exactMatch) return exactMatch.key;

    return (
      gatewayProfiles.value.find(
        (profile) =>
          profile.protocol === protocol &&
          profile.baseUrl.replace(/\/+$/u, '') === normalizedBaseUrl,
      )?.key || ''
    );
  };

  async function fetchGatewayProfiles() {
    try {
      const response = await ApiModels.gatewayProfiles();
      const data = response.data || {};
      gatewayProtocols.value = Array.isArray(data.protocols) ? data.protocols : [];
      gatewayProfiles.value = Array.isArray(data.profiles) ? data.profiles : [];
      gatewayCatalog.value = Array.isArray(data.catalog) ? data.catalog : [];
    } catch (error: any) {
      gatewayProtocols.value = [];
      gatewayProfiles.value = [];
      gatewayCatalog.value = [];
      remoteModelsMessage.value =
        error?.response?.data?.message || error?.message || '供应商模板获取失败';
    }
  }

  function handleProviderProfileChange(profileKey: string) {
    const profile = gatewayProfiles.value.find((item) => item.key === profileKey);
    if (!profile) {
      selectedProviderProfileKey.value = '';
      fetchRemoteModels();
      refreshRequestUrlPreview();
      return;
    }

    formPackage.protocol = profile.protocol || 'openai_chat_completions';
    formPackage.baseUrl = profile.baseUrl || '';
    formPackage.endpointPath = profile.endpointPath || '';
    formPackage.multimodalTypes = normalizeSupportedMultimodalTypes(
      profile.defaultMultimodalTypes || [],
      isMultimodalTypeSupported,
    );
    formPackage.capabilities = withReasoningControl(
      mergeCapabilitiesWithMultimodalTypes(
        profile.defaultCapabilities || {},
        formPackage.multimodalTypes,
      ),
    );
    formPackage.additionalParams = stringifyAdditionalParams(profile.defaultAdditionalParams);

    const firstCatalogModel = profile.modelCatalog?.[0];
    if (firstCatalogModel) {
      formPackage.model = firstCatalogModel.id;
      applyCatalogModel(firstCatalogModel);
    }

    fetchRemoteModels();
    refreshRequestUrlPreview();
  }

  let remoteModelsRequestId = 0;
  async function fetchRemoteModels() {
    const requestId = ++remoteModelsRequestId;
    remoteModelsMessage.value = '';
    const payload = buildModelGatewayPayload();
    if (!remoteModelListSupported.value) {
      remoteModels.value = [];
      remoteModelsMessage.value = '当前模板不支持远程模型列表，已使用内置模型目录';
      return;
    }
    if (!payload.baseUrl || !canUseKeyForRequest(payload)) {
      remoteModels.value = [];
      remoteModelsMessage.value = '填写基础地址和 Key 后可获取远程模型；当前使用内置模型目录';
      return;
    }

    remoteModelsLoading.value = true;
    try {
      const response = await ApiModels.listRemoteModels(payload);
      // 丢弃迟到的旧响应，避免切换供应商档案后旧列表覆盖新配置
      if (requestId !== remoteModelsRequestId) return;
      const data = response.data;
      const models: Array<{ id: string; owned_by?: string; object?: string }> = Array.isArray(data)
        ? data
        : Array.isArray(data?.data)
          ? data.data
          : [];

      const validModels = models
        .filter((m) => m.id && (!m.object || m.object === 'model'))
        .map((m) => {
          // 优先用 owned_by，否则从 id 中提取归属前缀（如 deepseek/deepseek-v4-pro → deepseek）
          const owner = m.owned_by || m.id.split('/')[0] || 'unknown';
          return { id: m.id, owned_by: owner };
        });

      validModels.sort((a, b) => {
        const ownerCompare = a.owned_by.localeCompare(b.owned_by);
        if (ownerCompare !== 0) return ownerCompare;
        return a.id.localeCompare(b.id);
      });

      remoteModels.value = validModels.map((m) => m.id);
    } catch (error: any) {
      if (requestId !== remoteModelsRequestId) return;
      remoteModels.value = [];
      remoteModelsMessage.value =
        error?.response?.data?.message ||
        error?.message ||
        '远程模型列表获取失败，已使用内置模型目录';
    } finally {
      if (requestId === remoteModelsRequestId) {
        remoteModelsLoading.value = false;
      }
    }
  }

  /* 防抖监听模型网关配置变化 */
  let fetchTimer: ReturnType<typeof setTimeout> | null = null;
  watch(
    () => [
      formPackage.protocol,
      formPackage.baseUrl,
      formPackage.key,
      formPackage.endpointPath,
      formPackage.model,
    ],
    () => {
      if (fetchTimer) clearTimeout(fetchTimer);
      fetchTimer = setTimeout(() => {
        fetchRemoteModels();
        refreshRequestUrlPreview();
      }, 800);
    },
  );

  watch(
    () => formPackage.protocol,
    () => {
      if (
        selectedProviderProfile.value &&
        selectedProviderProfile.value.protocol !== formPackage.protocol
      ) {
        selectedProviderProfileKey.value = '';
      }
      formPackage.multimodalTypes = formPackage.multimodalTypes.filter(isMultimodalTypeSupported);
    },
  );

  const dialogTitle = computed(() => {
    return activeModelKeyId.value ? '修改模型' : '新增模型';
  });

  const dialogButton = computed(() => {
    return activeModelKeyId.value ? '确认更新' : '确认新增';
  });

  /* 导入导出 */
  const configJsonVisible = ref(false);
  const configJsonContent = ref('');
  const copySuccess = ref(false);

  const {
    loading,
    total,
    tableData,
    query: queryModelsList,
    search: searchModelsList,
  } = usePagedTable(async () => {
    const res = await ApiModels.queryModels({
      ...formInline,
      status: status.value,
    });
    return res.data;
  }, formInline);

  async function handleDeleteKey(row: any) {
    const { id } = row;
    await ApiModels.delModels({ id });
    ElMessage({ type: 'success', message: '操作完成！' });
    // 删除末页最后一条后回退到最后一个非空页，避免停留在越界空页
    formInline.page = resolvePageAfterRemoval(formInline.page, formInline.size, total.value);
    queryModelsList();
  }

  const statusToggles = createModelStatusToggles({
    rows: () => tableData.value as any[],
    send: async (id, enabled) => {
      await ApiModels.setModelStatus({ id, status: enabled });
    },
    onSaved: (enabled) => ElMessage({ type: 'success', message: enabled ? '已启用' : '已禁用' }),
  });

  function handleToggleStatus(row: any, val: string | number | boolean) {
    void statusToggles.toggle(row, Boolean(val));
  }

  /** 编辑 / 复制：弹窗打开后的下一个 tick 一次写入表单（overrides 在同一次赋值里生效） */
  function assignModelForm(row: any, overrides?: Record<string, unknown>) {
    nextTick(() => {
      Object.assign(
        formPackage,
        modelFormValuesFromRow(row, isMultimodalTypeSupportedFor, overrides),
      );
      selectedProviderProfileKey.value = inferProviderProfileKey(
        formPackage.protocol,
        formPackage.baseUrl,
        formPackage.endpointPath,
      );
    });
    visible.value = true;
    nextTick(() => fetchRemoteModels());
  }

  function handleEditKey(row: any) {
    activeModelKeyId.value = row.id;
    assignModelForm(row);
  }

  function handleCopyKey(row: any) {
    // 重置表单为初始状态，确保不会保留之前的ID
    activeModelKeyId.value = 0;
    // 列表里的密钥是脱敏值，复制过来不能用：和名称一起在同一次赋值里清空，要求重新填写
    assignModelForm(row, copiedModelOverrides(row));
    ElMessage.info('已复制模型配置，请重新填写 API Key');
  }

  /* ========== 导入导出模型配置 ========== */
  function openConfigJson() {
    const item: Record<string, any> = {};
    for (const field of EXPORT_FIELDS) {
      item[field] = (formPackage as any)[field] ?? '';
    }
    configJsonContent.value = JSON.stringify(item, null, 2);
    configJsonVisible.value = true;
  }

  /** 导入只改导出字段里类型正确的值，从不改密钥（编辑时沿用已存的，新建时用自己填的） */
  function applyConfigJson() {
    const values = parseModelConfigJson(configJsonContent.value);
    if (!values) {
      ElMessage.error('JSON 格式错误');
      return;
    }
    nextTick(() => {
      Object.assign(formPackage, values);
      // 新建 / 复制的模型没有可沿用的已存密钥：表单里若残留脱敏值，清空要求重新填写
      if (!activeModelKeyId.value && isMaskedKey(formPackage.key)) formPackage.key = '';
      formPackage.capabilities = withReasoningControl(
        normalizeCapabilities(formPackage.capabilities),
      );
    });
    configJsonVisible.value = false;
    ElMessage.success('配置已应用');
  }

  function copyToClipboard() {
    navigator.clipboard
      .writeText(configJsonContent.value)
      .then(() => {
        copySuccess.value = true;
        setTimeout(() => {
          copySuccess.value = false;
        }, 2000);
      })
      .catch(() => ElMessage.error('复制失败'));
  }

  // 添加模型时的处理函数
  function handleAddModel() {
    // 重置表单
    activeModelKeyId.value = 0;
    selectedProviderProfileKey.value = '';
    remoteModels.value = [];
    nextTick(() => {
      Object.assign(formPackage, {
        modelName: '',
        key: '',
        status: true,
        model: '',
        isTokenBased: false,
        tokenFeeRatio: 1000,
        modelOrder: 0,
        baseUrl: '',
        protocol: 'openai_chat_completions',
        endpointPath: '',
        deduct: 1,
        multimodalTypes: [],
        capabilities: withReasoningControl({}),
        modelLimits: 50,
        maxModelTokens: 64000,
        modelDescription: '',
        systemPrompt: '',
        systemPromptType: 0,
        additionalParams: '',
      });

      // 打开对话框
      visible.value = true;
    });
  }

  const modelAvatarPreview = computed(() => {
    if (!formPackage.modelAvatar) return '';
    if (isSvgCode(formPackage.modelAvatar)) {
      return sanitizeSvg(formPackage.modelAvatar);
    }
    return formPackage.modelAvatar;
  });

  const shouldRenderSvg = computed(() => {
    return isSvgCode(formPackage.modelAvatar);
  });

  const { uploadAsset, reuploadAsset } = useAssetUpload('system/models');

  const handleAvatarSuccess: UploadProps['onSuccess'] = (response) => {
    const url = getUploadedUrl(response?.data);
    if (url) {
      formPackage.modelAvatar = url;
    } else {
      ElMessage.error('上传成功但未获取到URL');
    }
  };

  async function reuploadModelAvatar() {
    if (!formPackage.modelAvatar) return;
    ElMessage.info('正在重新上传模型头像...');
    try {
      formPackage.modelAvatar = await reuploadAsset(formPackage.modelAvatar);
      ElMessage.success('重新上传模型头像成功');
    } catch (error) {
      console.error('重新上传模型头像失败', error);
      ElMessage.error('重新上传模型头像失败，请检查链接是否有效');
    }
  }

  // 自定义上传方法
  const customUpload: UploadRequestHandler = (options: UploadRequestOptions) => {
    const { file, onSuccess, onError } = options;
    return uploadAsset(file)
      .then((response) => {
        if (onSuccess) {
          ElMessage.success('上传成功');
          onSuccess({ ...response, data: getUploadedUrl(response.data) });
        }
        return response;
      })
      .catch((error) => {
        // 请求失败已由 @/api 响应拦截器提示
        if (onError) {
          onError(error);
        }
        console.error('上传失败', error);
        throw error;
      });
  };

  async function handlerSubmit(formEl: FormInstance | undefined) {
    formEl?.validate(async (valid) => {
      if (valid) {
        // 在保存前格式化JSON附加参数
        try {
          if (formPackage.additionalParams && formPackage.additionalParams.trim()) {
            formPackage.additionalParams = formatJSON(formPackage.additionalParams);
          }
        } catch (error) {
          ElMessage.error('附加参数JSON格式错误，请检查后重试');
          return;
        }

        const params: any = JSON.parse(JSON.stringify(formPackage));
        delete params.id;
        if (activeModelKeyId.value) {
          params.id = activeModelKeyId.value;
        }
        params.protocol = params.protocol || 'openai_chat_completions';
        params.multimodalTypes = (params.multimodalTypes || []).filter((type: string) =>
          isMultimodalTypeSupported(type),
        );
        params.capabilities = withReasoningControl(
          mergeCapabilitiesWithMultimodalTypes(params.capabilities, params.multimodalTypes || []),
        );

        if (submitting.value) return;
        submitting.value = true;
        try {
          await ApiModels.setModels(params);
          ElMessage.success('已保存');
          activeModelKeyId.value = 0;
          visible.value = false;
          queryModelsList();
        } finally {
          submitting.value = false;
        }
      }
    });
  }
  const submitting = ref(false);

  const beforeAvatarUpload: UploadProps['beforeUpload'] = (rawFile) => {
    const allowedTypes = [
      'image/png',
      'image/jpeg',
      'image/gif',
      'image/webp',
      'image/x-icon',
      'image/vnd.microsoft.icon',
      'image/svg+xml',
    ];
    const allowedExtensions = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.ico', '.svg'];

    // 获取文件扩展名
    const fileName = rawFile.name.toLowerCase();
    const fileExtension = fileName.substring(fileName.lastIndexOf('.'));

    if (!allowedTypes.includes(rawFile.type) && !allowedExtensions.includes(fileExtension)) {
      ElMessage.error('当前系统仅支持 PNG、JPEG、GIF、WebP、ICO 和 SVG 格式的图片!');
      return false;
    } else if (rawFile.size / 1024 > 3000) {
      ElMessage.error('当前限制文件最大不超过 3000KB!');
      return false;
    }
    return true;
  };

  onMounted(() => {
    fetchGatewayProfiles();
    queryModelsList();
  });
</script>

<template>
  <div>
    <page-panel>
      <FilterBar
        v-model:keyword="formInline.model"
        keyword-placeholder="搜索绑定模型"
        :fields="filterFields"
        :filters="formInline"
        class="mb-5"
        @update:filters="handleFiltersUpdate"
        @apply="searchModelsList"
        @reset="searchModelsList"
      >
        <el-button type="primary" @click="handleAddModel">
          <AppIcon name="i-lucide:plus" class="mr-1" />
          添加模型
        </el-button>
      </FilterBar>
      <el-table v-loading="loading" border :data="tableData" style="width: 100%">
        <el-table-column prop="modelOrder" label="排序" width="70" align="right" />
        <el-table-column prop="modelName" label="模型名称" min-width="100" />
        <el-table-column prop="model" label="绑定模型" min-width="180">
          <template #default="scope">
            <span class="font-mono text-[13px]">{{ scope.row.model }}</span>
          </template>
        </el-table-column>
        <el-table-column prop="multimodalTypes" label="多模态" min-width="160">
          <template #default="scope">
            <template v-if="scope.row.multimodalTypes?.length">
              <el-tag
                v-for="t in ['image_url', 'document', 'video_url', 'audio_url'].filter((k) =>
                  scope.row.multimodalTypes.includes(k),
                )"
                :key="t"
                size="small"
                type="info"
                class="mr-1"
              >
                {{
                  t === 'image_url'
                    ? '图片'
                    : t === 'document'
                      ? '文档'
                      : t === 'video_url'
                        ? '视频'
                        : '音频'
                }}
              </el-tag>
            </template>
            <span v-else class="text-gray-400">纯文本</span>
          </template>
        </el-table-column>
        <el-table-column prop="useCount" align="right" label="调用次数" width="90" />
        <el-table-column prop="useToken" align="right" label="已用 Token" width="110" />
        <el-table-column align="center" label="状态" width="80">
          <template #default="scope">
            <el-switch
              :model-value="statusToggles.statusOf(scope.row)"
              :loading="statusToggles.saving(scope.row.id)"
              @change="(val: string | number | boolean) => handleToggleStatus(scope.row, val)"
            />
          </template>
        </el-table-column>
        <el-table-column fixed="right" label="操作" width="170">
          <template #default="scope">
            <el-button link type="primary" size="small" @click="handleEditKey(scope.row)">
              变更
            </el-button>
            <el-button link type="success" size="small" @click="handleCopyKey(scope.row)">
              复制
            </el-button>
            <el-popconfirm
              title="删除后不可恢复，确认删除此模型？"
              width="240"
              @confirm="handleDeleteKey(scope.row)"
            >
              <template #reference>
                <el-button link type="danger" size="small"> 删除 </el-button>
              </template>
            </el-popconfirm>
          </template>
        </el-table-column>
      </el-table>
      <TablePager
        v-model:page="formInline.page"
        v-model:size="formInline.size"
        :total="total"
        @change="queryModelsList"
      />
    </page-panel>

    <el-dialog
      v-model="visible"
      :close-on-click-modal="false"
      :title="dialogTitle"
      fullscreen
      @close="handlerCloseDialog(formPackageRef)"
    >
      <el-form
        ref="formPackageRef"
        v-loading="loading"
        label-position="right"
        label-width="120px"
        :model="formPackage"
        :rules="rules"
        class="model-form-container"
      >
        <el-row :gutter="24">
          <!-- 左栏：基础信息 + API配置 -->
          <el-col :span="12" class="left-column">
            <!-- 基础信息 -->
            <div class="form-section">
              <el-row :gutter="16">
                <el-col :span="12">
                  <el-form-item label="状态" prop="status">
                    <el-switch v-model="formPackage.status" />
                  </el-form-item>
                </el-col>
                <el-col :span="12">
                  <el-form-item label="排序" prop="modelOrder">
                    <el-input-number
                      v-model="formPackage.modelOrder"
                      :max="999"
                      :min="0"
                      :step="10"
                      controls-position="right"
                      class="w-full"
                    />
                  </el-form-item>
                </el-col>
              </el-row>

              <el-form-item label="模型名称" prop="modelName">
                <el-input v-model="formPackage.modelName" placeholder="如：GPT-4 Turbo" />
              </el-form-item>

              <el-form-item label="模型简介" prop="modelDescription">
                <el-input
                  v-model="formPackage.modelDescription"
                  type="text"
                  placeholder="简短描述模型特点"
                />
              </el-form-item>

              <el-form-item label="模型图标" prop="modelAvatar">
                <el-input v-model="formPackage.modelAvatar" placeholder="图标 URL" clearable>
                  <template #append>
                    <el-upload
                      class="avatar-uploader"
                      :http-request="customUpload"
                      :show-file-list="false"
                      :on-success="handleAvatarSuccess"
                      :before-upload="beforeAvatarUpload"
                      accept="image/png,image/jpeg,image/jpg,image/gif,image/webp,.ico,.svg"
                    >
                      <img
                        v-if="formPackage.modelAvatar && !shouldRenderSvg"
                        :src="formPackage.modelAvatar"
                        style="max-width: 1.5rem; max-height: 1.5rem; object-fit: contain"
                      />
                      <div
                        v-else-if="formPackage.modelAvatar && shouldRenderSvg"
                        v-html="modelAvatarPreview"
                        style="max-width: 1.5rem; max-height: 1.5rem"
                      />
                      <el-icon v-else style="width: 1rem">
                        <AppIcon name="i-lucide:plus" />
                      </el-icon>
                    </el-upload>
                    <el-icon
                      v-if="formPackage.modelAvatar"
                      @click="reuploadModelAvatar"
                      style="margin-left: 10px; width: 1rem; cursor: pointer"
                    >
                      <AppIcon name="i-lucide:refresh-cw" />
                    </el-icon>
                  </template>
                </el-input>
              </el-form-item>

              <el-form-item label="调用频率" prop="modelLimits">
                <el-input-number
                  v-model="formPackage.modelLimits"
                  :max="999"
                  :min="0"
                  :step="5"
                  controls-position="right"
                />
                <span class="ml-2 text-gray-400">次/小时</span>
              </el-form-item>

              <el-form-item label="计费系数" prop="deduct">
                <el-input-number
                  v-model="formPackage.deduct"
                  :min="0"
                  :step="1"
                  controls-position="right"
                />
                <span class="ml-2 text-gray-400">每次对话消耗积分</span>
              </el-form-item>

              <el-row :gutter="16">
                <el-col :span="8">
                  <el-form-item label="Token计费" prop="isTokenBased">
                    <el-switch v-model="formPackage.isTokenBased" />
                  </el-form-item>
                </el-col>
                <el-col :span="16">
                  <el-form-item
                    v-if="formPackage.isTokenBased"
                    label="计费比例"
                    prop="tokenFeeRatio"
                  >
                    <div class="flex items-center gap-2">
                      <el-input-number
                        v-model="formPackage.tokenFeeRatio"
                        :min="0"
                        :step="100"
                        controls-position="right"
                        style="width: 140px"
                      />
                      <span class="text-gray-400 whitespace-nowrap"
                        >每{{ formPackage.tokenFeeRatio }}Token/{{ formPackage.deduct }}积分</span
                      >
                    </div>
                  </el-form-item>
                </el-col>
              </el-row>
            </div>

            <!-- API配置 -->
            <div class="form-section">
              <el-form-item label="供应商模板">
                <el-select
                  v-model="selectedProviderProfileKey"
                  filterable
                  clearable
                  placeholder="选择后自动填充协议、地址和模型"
                  class="w-full"
                  @change="handleProviderProfileChange"
                >
                  <el-option
                    v-for="item in gatewayProfiles"
                    :key="item.key"
                    :label="item.label"
                    :value="item.key"
                  >
                    <div class="flex flex-col">
                      <span>{{ item.label }}</span>
                      <span v-if="item.description" class="text-xs text-gray-400">
                        {{ item.description }}
                      </span>
                    </div>
                  </el-option>
                </el-select>
              </el-form-item>

              <el-form-item label="调用协议" prop="protocol">
                <el-select v-model="formPackage.protocol" class="w-full">
                  <el-option
                    v-for="item in protocolOptions"
                    :key="item.value"
                    :label="item.label"
                    :value="item.value"
                    :disabled="item.disabled"
                  />
                </el-select>
              </el-form-item>

              <el-form-item label="绑定模型" prop="model">
                <el-select
                  v-model="formPackage.model"
                  filterable
                  clearable
                  allow-create
                  @change="handleModelChange"
                  placeholder="如：gpt-4 turbo"
                  class="w-full"
                >
                  <el-option
                    v-for="item in modelSelectOptions"
                    :key="item.id"
                    :label="item.label"
                    :value="item.id"
                  />
                </el-select>
                <div v-if="remoteModelsLoading" class="text-xs text-gray-400 mt-1">
                  正在获取远程模型列表...
                </div>
                <div
                  v-else-if="remoteModels.length > 0"
                  class="text-xs text-[var(--el-color-success)] mt-1"
                >
                  已获取 {{ remoteModels.length }} 个远程模型
                </div>
                <div v-else-if="remoteModelsMessage" class="text-xs text-gray-400 mt-1">
                  {{ remoteModelsMessage }}
                </div>
              </el-form-item>

              <el-form-item label="API Key" prop="key">
                <el-input
                  v-model="formPackage.key"
                  type="password"
                  show-password
                  placeholder="sk-...（编辑时保持脱敏值不变即表示不修改密钥）"
                />
              </el-form-item>

              <el-form-item label="基础地址" prop="baseUrl">
                <el-input v-model="formPackage.baseUrl" placeholder="https://api.example.com" />
                <div v-if="actualRequestUrl" class="text-xs text-gray-400 mt-1">
                  完整请求：{{ actualRequestUrl }}
                </div>
                <div v-if="requestUrlWarning" class="text-xs text-[var(--el-color-warning)] mt-1">
                  {{ requestUrlWarning }}
                </div>
              </el-form-item>

              <el-form-item label="Endpoint Path" prop="endpointPath">
                <el-input
                  v-model="formPackage.endpointPath"
                  placeholder="默认 /v1/chat/completions，可留空"
                />
              </el-form-item>
            </div>
          </el-col>

          <!-- 右栏：多模态 + 上下文 + 高级设置 -->
          <el-col :span="12" class="right-column">
            <!-- 多模态支持 -->
            <div class="form-section">
              <el-form-item label="多模态支持" prop="multimodalTypes">
                <el-checkbox-group v-model="formPackage.multimodalTypes">
                  <el-checkbox
                    v-for="option in multimodalOptions"
                    :key="option.value"
                    :label="option.value"
                    :disabled="!isMultimodalTypeSupported(option.value)"
                  >
                    {{ option.label }}
                  </el-checkbox>
                </el-checkbox-group>
              </el-form-item>

              <el-form-item label="推理强度">
                <div class="reasoning-control-config">
                  <el-checkbox-group v-model="selectedReasoningLevels">
                    <el-checkbox
                      v-for="option in reasoningLevelOptions"
                      :key="option.value"
                      :label="option.value"
                      :disabled="
                        selectedReasoningLevels.length === 1 &&
                        selectedReasoningLevels.includes(option.value)
                      "
                    >
                      {{ option.label }}
                    </el-checkbox>
                  </el-checkbox-group>
                  <div class="text-xs text-gray-400 mt-1">
                    用户端只显示这里勾选的档位；真实探针会检查全部七档，只有生成独立控制参数并被服务接受的档位才会通过，不能证明供应商内部计算量一定不同。
                  </div>
                </div>
              </el-form-item>

              <el-form-item label="默认强度">
                <el-select v-model="defaultReasoningLevel" class="w-full">
                  <el-option
                    v-for="option in selectedReasoningLevelOptions"
                    :key="option.value"
                    :label="option.label"
                    :value="option.value"
                  />
                </el-select>
              </el-form-item>

              <el-form-item label="原生搜索">
                <div class="native-tool-config">
                  <div class="native-tool-row">
                    <el-switch
                      v-model="nativeWebSearchConfig.enabled"
                      :disabled="!supportsNativeWebSearch"
                      active-text="启用 OpenAI web_search"
                    />
                    <el-tooltip
                      content="仅 OpenAI Responses 协议生效；启用后会隐藏本地 web_search，避免重复搜索。"
                      placement="top"
                    >
                      <el-icon class="text-gray-400"
                        ><AppIcon name="i-lucide:circle-help"
                      /></el-icon>
                    </el-tooltip>
                  </div>
                  <div class="native-tool-grid">
                    <el-select
                      v-model="nativeWebSearchConfig.mode"
                      :disabled="!supportsNativeWebSearch || !nativeWebSearchConfig.enabled"
                      placeholder="搜索模式"
                    >
                      <el-option
                        v-for="item in nativeWebSearchModeOptions"
                        :key="item.value"
                        :label="item.label"
                        :value="item.value"
                      />
                    </el-select>
                    <el-select
                      v-model="nativeWebSearchConfig.toolType"
                      :disabled="!supportsNativeWebSearch || !nativeWebSearchConfig.enabled"
                      placeholder="工具类型"
                    >
                      <el-option
                        v-for="item in nativeWebSearchToolTypeOptions"
                        :key="item.value"
                        :label="item.label"
                        :value="item.value"
                      />
                    </el-select>
                    <el-select
                      v-model="nativeWebSearchConfig.searchContextSize"
                      :disabled="!supportsNativeWebSearch || !nativeWebSearchConfig.enabled"
                      placeholder="上下文量"
                    >
                      <el-option
                        v-for="item in nativeWebSearchContextSizeOptions"
                        :key="item.value"
                        :label="item.label"
                        :value="item.value"
                      />
                    </el-select>
                  </div>
                  <div class="text-xs text-gray-400 mt-1">
                    OpenAI 原生搜索由模型侧自动调用，搜索活动会以工具卡片展示。
                  </div>
                  <div class="native-tool-row mt-2">
                    <el-switch
                      v-model="nativeWebSearchConfig.includeSources"
                      :disabled="!supportsNativeWebSearch || !nativeWebSearchConfig.enabled"
                      active-text="展示搜索来源"
                    />
                  </div>
                </div>
              </el-form-item>

              <el-form-item label="上下文长度" prop="maxModelTokens">
                <el-input-number
                  v-model="formPackage.maxModelTokens"
                  :min="1000"
                  :step="1000"
                  controls-position="right"
                  class="w-full"
                />
              </el-form-item>
            </div>

            <!-- 高级设置 -->
            <div class="form-section flex-1">
              <el-form-item label="预设类型" prop="systemPromptType">
                <el-radio-group v-model="formPackage.systemPromptType">
                  <el-radio :value="0">关闭</el-radio>
                  <el-radio :value="1">附加</el-radio>
                  <el-radio :value="2">覆盖</el-radio>
                </el-radio-group>
              </el-form-item>

              <el-form-item label="系统预设" prop="systemPrompt">
                <el-input
                  v-model="formPackage.systemPrompt"
                  type="textarea"
                  :rows="3"
                  placeholder="You are a helpful assistant..."
                />
              </el-form-item>

              <el-form-item label="附加参数" prop="additionalParams">
                <el-input
                  v-model="formPackage.additionalParams"
                  type="textarea"
                  :rows="6"
                  placeholder="默认留空；仅在供应商明确要求时填写 JSON"
                />
                <div class="flex justify-end mt-1">
                  <el-button
                    size="small"
                    @click="handleFormatAdditionalParams"
                    :disabled="!formPackage.additionalParams"
                  >
                    格式化
                  </el-button>
                </div>
              </el-form-item>
            </div>
          </el-col>
        </el-row>
      </el-form>
      <template #footer>
        <div class="flex flex-col gap-3">
          <div class="flex flex-wrap items-center gap-2">
            <el-button @click="openConfigJson">
              <el-icon class="mr-1"><AppIcon name="i-lucide:arrow-down-up" /></el-icon>导入/导出
            </el-button>
            <el-button :loading="testLoading" @click="handleTestModel"> 真实探针 </el-button>
            <span class="whitespace-nowrap text-xs text-gray-400">会产生少量真实调用</span>
          </div>
          <div class="flex items-end justify-between gap-4">
            <div
              class="max-h-24 min-w-0 flex flex-1 flex-wrap items-center gap-2 overflow-y-auto pr-1"
            >
              <template v-if="testResults.length > 0">
                <el-tag
                  v-for="item in testResults"
                  :key="item.key"
                  :type="
                    item.status === 'success'
                      ? 'success'
                      : item.status === 'fail'
                        ? 'danger'
                        : item.status === 'running'
                          ? 'warning'
                          : 'info'
                  "
                  class="test-tag"
                  :title="item.message"
                >
                  {{ item.label }}:
                  {{
                    item.status === 'success'
                      ? '✓'
                      : item.status === 'fail'
                        ? '✗'
                        : item.status === 'running'
                          ? '...'
                          : item.status === 'skip'
                            ? '跳过'
                            : '-'
                  }}
                </el-tag>
              </template>
              <el-button
                v-if="testResults.some((item) => item.capability !== 'text')"
                size="small"
                :disabled="testLoading"
                @click="applyProbeResults"
              >
                应用通过项
              </el-button>
            </div>
            <div class="flex shrink-0 gap-2">
              <el-button @click="visible = false">取消</el-button>
              <el-button
                type="primary"
                :loading="submitting"
                @click="handlerSubmit(formPackageRef)"
              >
                {{ dialogButton }}
              </el-button>
            </div>
          </div>
        </div>
      </template>
    </el-dialog>

    <!-- 导入/导出模型配置 -->
    <el-dialog v-model="configJsonVisible" title="导入/导出模型配置" width="600px">
      <el-form>
        <el-form-item>
          <el-input
            v-model="configJsonContent"
            type="textarea"
            :rows="12"
            placeholder="可复制导出，也可粘贴覆盖后点击「应用到表单」"
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <span class="flex justify-end gap-2">
          <el-button @click="configJsonVisible = false">关闭</el-button>
          <el-button @click="copyToClipboard">
            {{ copySuccess ? '已复制' : '复制' }}
          </el-button>
          <el-button type="primary" @click="applyConfigJson">应用到表单</el-button>
        </span>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
  /* 全屏表单容器样式 */
  .model-form-container {
    height: calc(100vh - 120px);
    overflow-y: auto;
    padding: 0 12px;
  }

  .model-form-container :deep(.el-form-item__label) {
    font-weight: 500;
  }

  /* 左右两栏布局 */
  .left-column,
  .right-column {
    display: flex;
    flex-direction: column;
    gap: 0;
    height: 100%;
  }

  /* 表单分组区块 */
  .form-section {
    padding: 0;
  }

  /* 确保表单项内容区占满宽度 */
  .form-section :deep(.el-form-item__content) {
    width: 100%;
  }

  /* 优化滚动条样式 */
  .model-form-container::-webkit-scrollbar {
    width: 6px;
    height: 6px;
  }

  .model-form-container::-webkit-scrollbar-thumb {
    background: var(--u-border);
    border-radius: 3px;
  }

  .model-form-container::-webkit-scrollbar-thumb:hover {
    background: var(--u-text-placeholder);
  }

  /* 工具配置标签页 */
  .tool-config-tabs {
    box-shadow: var(--u-shadow-m);
  }

  .native-tool-config {
    width: 100%;
  }

  .reasoning-control-config {
    width: 100%;
  }

  .native-tool-row {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .native-tool-grid {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 8px;
    margin-top: 8px;
  }

  /* 调整对话框 footer 高度 */
  :deep(.el-dialog__footer) {
    padding: 16px 20px;
  }
</style>
