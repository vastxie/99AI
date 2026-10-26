<script lang="ts" setup>
  import apiConfig from '@/api/modules/config';
  import { formatDateTime } from '@/utils/format';
  import apiOfficial from '../api/official';
  import { WECHAT_BRAND_COLORS } from '../brand-colors';
  import type { FormRules } from 'element-plus';
  import { ElMessage, ElMessageBox } from 'element-plus';
  import { computed, nextTick, onMounted, reactive, ref } from 'vue';
  import { getDocUrl } from '@/utils/docUrl';
  import { usePageDoc } from '@/utils/composables/usePageDoc';
  import usePagedTable from '@/utils/composables/usePagedTable';
  import useConfigAutoSave from '@/utils/composables/useConfigAutoSave';
  import { createLatestGate } from '@/utils/latestRequest';

  const loginDocUrl = computed(() => getDocUrl('/configuration/access/wechat-login-config'));
  const menuDocUrl = computed(() => getDocUrl('/configuration/access/wechat-menu-config'));

  const activeTab = ref('login');
  const docUrl = computed(() =>
    activeTab.value === 'login' ? loginDocUrl.value : menuDocUrl.value,
  );
  usePageDoc(docUrl);
  const loading = ref(false);

  /* ==================== 微信登录配置相关 ==================== */
  const loginForm = reactive({
    wechatRegisterStatus: '',
    wechatSilentLoginStatus: '',
    wechatOfficialName: '',
    wechatOfficialAppId: '',
    wechatOfficialToken: '',
    wechatOfficialAppSecret: '',
    wechatOpenWebLoginEnabled: '0',
    wechatOpenWebAppId: '',
    wechatOpenWebAppSecret: '',
    wechatOpenWebCallbackUrl: '',
    wechatOpenWebFastLoginEnabled: '1',
    wechatOpenWebFallbackEnabled: '1',
    wechatOpenUrl: '',
    wechatApiUrl: '',
    wechatMpUrl: '',
    officialSubscribeText: '',
    officialBindAccountText: '',
    officialBindAccountFailText: '',
    officialScanLoginText: '',
    officialAutoReplyText: '',
  });
  const {
    loadFailed,
    isReady,
    isUnmounting,
    initFromConfig,
    markLoadFailed,
    saveField: saveConfigField,
    saving,
  } = useConfigAutoSave({ form: loginForm });

  const loginRules = ref<FormRules>({
    wechatOfficialName: [{ required: false, trigger: 'blur', message: '请填写微信公众号名称' }],
    wechatOfficialAppId: [
      {
        required: false,
        trigger: 'blur',
        message: '请填写微信公众号开发配置 AppId',
      },
    ],
    wechatOfficialToken: [
      {
        required: false,
        trigger: 'blur',
        message: '请填写微信公众号开发配置 Token',
      },
    ],
    wechatOfficialAppSecret: [
      {
        required: false,
        trigger: 'blur',
        message: '请填写微信公众号开发配置 AppSecret',
      },
    ],
    wechatOpenWebCallbackUrl: [
      {
        validator: (_rule: unknown, value: string, callback: (error?: Error) => void) => {
          if (!value) {
            callback();
            return;
          }
          const trimmed = value.trim();
          if (/\s/u.test(trimmed)) {
            callback(new Error('回调地址不能包含空格'));
            return;
          }
          try {
            const url = new URL(trimmed);
            const isLocalHttp =
              url.protocol === 'http:' &&
              ['localhost', '127.0.0.1', '::1', '[::1]'].includes(url.hostname);
            if (url.protocol !== 'https:' && !isLocalHttp) {
              callback(new Error('回调地址需使用 HTTPS，本地调试可使用 localhost HTTP'));
              return;
            }
            callback();
          } catch {
            callback(
              new Error(
                '请填写完整回调地址，例如 https://example.com/auth/callback/wechat_open_web',
              ),
            );
          }
        },
        trigger: 'blur',
      },
    ],
  });

  // 查询登录配置
  async function queryLoginConfig() {
    try {
      await loadLoginConfig();
    } catch {
      markLoadFailed();
    }
  }

  async function loadLoginConfig() {
    const res = await apiConfig.queryConfig({
      keys: [
        'wechatOfficialName',
        'wechatOfficialAppId',
        'wechatOfficialToken',
        'wechatOfficialAppSecret',
        'wechatOpenWebLoginEnabled',
        'wechatOpenWebAppId',
        'wechatOpenWebAppSecret',
        'wechatOpenWebCallbackUrl',
        'wechatOpenWebFastLoginEnabled',
        'wechatOpenWebFallbackEnabled',
        'wechatOpenUrl',
        'wechatApiUrl',
        'wechatMpUrl',
        'officialSubscribeText',
        'officialBindAccountText',
        'officialBindAccountFailText',
        'officialScanLoginText',
        'officialAutoReplyText',
        'wechatRegisterStatus',
        'wechatSilentLoginStatus',
      ],
    });
    Object.assign(loginForm, res.data);
    await nextTick();
    initFromConfig(res.data);
  }

  /* ==================== 公众号菜单相关 ==================== */
  interface MenuItem {
    type?: string;
    name: string;
    key?: string;
    url?: string;
    appid?: string;
    pagepath?: string;
    media_id?: string;
    article_id?: string;
    content?: string;
    sub_button: MenuItem[];
  }

  interface MenuForm {
    button: MenuItem[];
  }

  const menuForm = reactive<MenuForm>({
    button: [],
  });

  const wechatConfigured = ref(false);
  const activeMenuIndex = ref<number | null>(null);
  const activeSubMenuIndex = ref<number | null>(null);

  // 素材选择相关
  const materialDialogVisible = ref(false);
  const materialType = ref('news');
  const materialQuery = reactive({ page: 1, size: 20 });

  // 菜单类型选项
  const menuTypes = [
    { label: '回复文字', value: 'click', description: '点击后自动回复文字内容' },
    { label: '跳转网页', value: 'view', description: '打开指定网页' },
    { label: '跳转小程序', value: 'miniprogram', description: '打开关联的小程序' },
    { label: '图文素材', value: 'media_id', description: '发送图文消息（需素材ID）' },
    { label: '图文链接', value: 'view_limited', description: '跳转已发布图文（需选择素材）' },
  ];

  /** 公众号三项凭据：保存成功后重新向服务端确认「已配置」（不看表单值） */
  const OFFICIAL_CREDENTIAL_KEYS = new Set([
    'wechatOfficialAppId',
    'wechatOfficialToken',
    'wechatOfficialAppSecret',
  ]);
  /** 复查只认最后一次的结果：连着保存几项时，较早的复查晚到不覆盖 */
  const configCheck = createLatestGate();

  // 检查微信公众号配置；返回这次是否落地（被更新的复查取代时为 false）
  async function checkWechatConfig() {
    const token = configCheck.begin();
    try {
      const res = await apiConfig.queryConfig({
        keys: ['wechatOfficialAppId', 'wechatOfficialToken', 'wechatOfficialAppSecret'],
      });
      if (!configCheck.isLatest(token) || isUnmounting.value) return false;
      const { wechatOfficialAppId, wechatOfficialToken, wechatOfficialAppSecret } = res.data;
      wechatConfigured.value = !!(
        wechatOfficialAppId &&
        wechatOfficialToken &&
        wechatOfficialAppSecret
      );
      return true;
    } catch (error) {
      console.error('获取微信配置失败', error);
      return false;
    }
  }

  /** 凭据保存成功后复查：从未配置变成已配置时拉一次菜单，菜单与素材随即可用 */
  async function recheckWechatConfig() {
    const wasConfigured = wechatConfigured.value;
    const settled = await checkWechatConfig();
    if (settled && !wasConfigured && wechatConfigured.value) await queryMenu();
  }

  // 查询当前菜单配置
  async function queryMenu() {
    try {
      const res = await apiOfficial.queryOfficialMenu();
      if (res.data && res.data.menu && res.data.menu.button) {
        menuForm.button = res.data.menu.button;
      }
    } catch (error) {
      console.error('获取菜单配置失败', error);
    }
  }

  // 自动生成KEY值
  function generateKey(name: string): string {
    return `KEY_${name.replaceAll(/[^\u4E00-\u9FA5a-zA-Z0-9]/gu, '')}_${Date.now()}`;
  }

  // 确保菜单项有必要属性
  function ensureMenuItemsHaveRequiredProps(menuItems: MenuItem[]) {
    for (const item of menuItems) {
      if (!item.key || item.key.startsWith('KEY_菜单') || item.key.startsWith('KEY_子菜单')) {
        item.key = generateKey(item.name);
      }

      if (!item.content) item.content = '';
      if (!item.media_id) item.media_id = '';
      if (!item.url) item.url = '';
      if (!item.appid) item.appid = '';
      if (!item.pagepath) item.pagepath = '';
      if (!item.article_id) item.article_id = '';

      if (item.sub_button && item.sub_button.length > 0) {
        ensureMenuItemsHaveRequiredProps(item.sub_button);
      }
    }
  }

  // 保存菜单
  async function saveMenu() {
    if (!wechatConfigured.value) {
      ElMessage.warning('请先完成微信公众号基本配置');
      return;
    }

    // 验证菜单配置
    let hasError = false;
    menuForm.button.forEach((item, index) => {
      if (!item.name || item.name.trim() === '') {
        ElMessage.error(`第 ${index + 1} 个菜单名称不能为空`);
        hasError = true;
        return;
      }

      if (item.sub_button && item.sub_button.length > 0) {
        item.sub_button.forEach((subItem, subIndex) => {
          if (!subItem.name || subItem.name.trim() === '') {
            ElMessage.error(`第 ${index + 1} 个菜单的第 ${subIndex + 1} 个子菜单名称不能为空`);
            hasError = true;
            return;
          }
          if (!subItem.type) {
            ElMessage.error(`第 ${index + 1} 个菜单的第 ${subIndex + 1} 个子菜单未选择类型`);
            hasError = true;
            return;
          }

          const errorPrefix = `第 ${index + 1} 个菜单的第 ${subIndex + 1} 个子菜单`;
          if (subItem.type === 'click' && (!subItem.content || !subItem.content.trim())) {
            ElMessage.error(`${errorPrefix}需要填写回复内容`);
            hasError = true;
            return;
          }
          if (
            subItem.type === 'view' &&
            (!subItem.url || subItem.url === 'http://' || subItem.url === 'https://')
          ) {
            ElMessage.error(`${errorPrefix}需要填写跳转链接`);
            hasError = true;
            return;
          }
          if (subItem.type === 'miniprogram' && (!subItem.appid || !subItem.pagepath)) {
            ElMessage.error(`${errorPrefix}需要填写小程序AppID和页面路径`);
            hasError = true;
            return;
          }
          if (subItem.type === 'media_id' && !subItem.media_id) {
            ElMessage.error(`${errorPrefix}需要填写素材ID`);
            hasError = true;
            return;
          }
          if (subItem.type === 'view_limited' && !subItem.media_id) {
            ElMessage.error(`${errorPrefix}需要选择已发布的图文素材`);
            hasError = true;
          }
        });
      } else {
        if (!item.type) {
          ElMessage.error(`第 ${index + 1} 个菜单未选择类型或添加子菜单`);
          hasError = true;
          return;
        }

        const errorPrefix = `第 ${index + 1} 个菜单`;
        if (item.type === 'click' && (!item.content || !item.content.trim())) {
          ElMessage.error(`${errorPrefix}需要填写回复内容`);
          hasError = true;
          return;
        }
        if (
          item.type === 'view' &&
          (!item.url || item.url === 'http://' || item.url === 'https://')
        ) {
          ElMessage.error(`${errorPrefix}需要填写跳转链接`);
          hasError = true;
          return;
        }
        if (item.type === 'miniprogram' && (!item.appid || !item.pagepath)) {
          ElMessage.error(`${errorPrefix}需要填写小程序AppID和页面路径`);
          hasError = true;
          return;
        }
        if (item.type === 'media_id' && !item.media_id) {
          ElMessage.error(`${errorPrefix}需要填写素材ID`);
          hasError = true;
          return;
        }
        if (item.type === 'view_limited' && !item.media_id) {
          ElMessage.error(`${errorPrefix}需要选择已发布的图文素材`);
          hasError = true;
        }
      }
    });

    if (hasError) return;

    loading.value = true;
    ensureMenuItemsHaveRequiredProps(menuForm.button);
    try {
      await apiOfficial.createOfficialMenu(menuForm);
      ElMessage.success('菜单保存成功，预计5分钟后生效');
      await queryMenu();
    } catch {
      // 请求层已统一提示错误
    } finally {
      loading.value = false;
    }
  }

  // 删除菜单
  async function deleteMenu() {
    if (!wechatConfigured.value) {
      ElMessage.warning('请先完成微信公众号基本配置');
      return;
    }

    try {
      await ElMessageBox.confirm('确定要删除所有自定义菜单吗？', '提示', {
        confirmButtonText: '确定',
        cancelButtonText: '取消',
        type: 'warning',
      });

      loading.value = true;
      await apiOfficial.deleteOfficialMenu();
      ElMessage.success('菜单已删除');
      menuForm.button = [];
      activeMenuIndex.value = null;
      activeSubMenuIndex.value = null;
    } catch {
      // 取消确认，或请求失败（请求层已提示）
    } finally {
      loading.value = false;
    }
  }

  // 添加一级菜单
  function addFirstLevelMenu() {
    if (menuForm.button.length >= 3) {
      ElMessage.warning('一级菜单最多3个');
      return;
    }
    const newMenu: MenuItem = {
      name: `菜单名称`,
      key: generateKey(`菜单${menuForm.button.length + 1}`),
      type: 'click',
      content: '',
      url: '',
      media_id: '',
      appid: '',
      pagepath: '',
      article_id: '',
      sub_button: [],
    };
    menuForm.button.push(newMenu);
    activeMenuIndex.value = menuForm.button.length - 1;
    activeSubMenuIndex.value = null;
  }

  // 添加二级菜单
  function addSecondLevelMenu(index: number) {
    if (menuForm.button[index].sub_button.length >= 5) {
      ElMessage.warning('子菜单最多5个');
      return;
    }

    const newSubMenu: MenuItem = {
      type: 'click',
      name: `子菜单名称`,
      key: generateKey(`子菜单${menuForm.button[index].sub_button.length + 1}`),
      content: '',
      url: '',
      media_id: '',
      appid: '',
      pagepath: '',
      article_id: '',
      sub_button: [],
    };

    menuForm.button[index].sub_button.push(newSubMenu);
    activeSubMenuIndex.value = menuForm.button[index].sub_button.length - 1;
  }

  // 移除菜单项
  async function removeMenuItem(firstIndex: number, secondIndex?: number) {
    try {
      await ElMessageBox.confirm('确定要删除这个菜单吗？', '提示', {
        confirmButtonText: '确定',
        cancelButtonText: '取消',
        type: 'warning',
      });

      if (secondIndex !== undefined) {
        menuForm.button[firstIndex].sub_button.splice(secondIndex, 1);
        ElMessage.success('子菜单已删除');
        activeSubMenuIndex.value = null;
      } else {
        menuForm.button.splice(firstIndex, 1);
        activeMenuIndex.value = null;
        activeSubMenuIndex.value = null;
        ElMessage.success('菜单已删除');
      }
    } catch (error) {
      // 用户取消
    }
  }

  // 选择菜单
  function selectMenu(index: number, subIndex?: number) {
    activeMenuIndex.value = index;
    activeSubMenuIndex.value = subIndex !== undefined ? subIndex : null;
  }

  // 当前选中的菜单项
  const currentMenuItem = computed(() => {
    if (activeMenuIndex.value === null) return null;
    if (activeSubMenuIndex.value !== null) {
      return menuForm.button[activeMenuIndex.value]?.sub_button[activeSubMenuIndex.value];
    }
    return menuForm.button[activeMenuIndex.value];
  });

  // 打开素材选择器
  function openMaterialSelector() {
    if (!wechatConfigured.value) {
      ElMessage.warning('请先完成微信公众号基本配置');
      return;
    }
    materialDialogVisible.value = true;
    searchMaterials();
  }

  // 加载素材列表(后端按 offset 取数,这里由页码换算)
  const {
    loading: materialLoading,
    total: materialTotal,
    tableData: materialList,
    query: loadMaterialList,
    search: searchMaterials,
  } = usePagedTable<any>(async () => {
    try {
      const res = await apiOfficial.getMaterialList({
        type: materialType.value,
        offset: (materialQuery.page - 1) * materialQuery.size,
        count: materialQuery.size,
      });
      return { rows: res.data.item || [], count: res.data.total_count || 0 };
    } catch {
      return { rows: [], count: 0 };
    }
  }, materialQuery);

  // 切换素材类型
  function handleMaterialTypeChange() {
    searchMaterials();
  }

  // 选择素材
  function selectMaterial(material: any) {
    if (currentMenuItem.value) {
      currentMenuItem.value.media_id = material.media_id;
      materialDialogVisible.value = false;
      ElMessage.success('素材选择成功');
    }
  }

  // 格式化微信素材的秒级时间戳
  function formatTime(timestamp: number) {
    return formatDateTime(timestamp ? new Date(timestamp * 1000).toISOString() : '');
  }

  /* ==================== 通用方法 ==================== */
  const binaryConfigKeys = new Set([
    'wechatOpenWebLoginEnabled',
    'wechatOpenWebFastLoginEnabled',
    'wechatOpenWebFallbackEnabled',
  ]);

  function isValidCallbackUrl(value: string) {
    if (!value) return true;
    if (/\s/u.test(value)) return false;
    try {
      const url = new URL(value);
      const isLocalHttp =
        url.protocol === 'http:' &&
        ['localhost', '127.0.0.1', '::1', '[::1]'].includes(url.hostname);
      return url.protocol === 'https:' || isLocalHttp;
    } catch {
      return false;
    }
  }

  // 字段级自动保存（附带微信配置特有的取值校验）
  async function saveField(key: string, value: string) {
    if (!isReady.value || isUnmounting.value) return;
    const trimmed = value.trim();
    if (binaryConfigKeys.has(key) && !['0', '1'].includes(trimmed)) {
      ElMessage.error('开关配置只允许保存 0 或 1');
      return;
    }
    if (key === 'wechatOpenWebCallbackUrl' && !isValidCallbackUrl(trimmed)) {
      ElMessage.error('回调地址需使用 HTTPS，本地调试可使用 localhost HTTP，且不能包含空格');
      return;
    }
    await saveConfigField(key, trimmed, {
      onSaved: () => {
        if (OFFICIAL_CREDENTIAL_KEYS.has(key)) void recheckWechatConfig();
      },
    });
  }

  onMounted(async () => {
    await queryLoginConfig();
    await checkWechatConfig();
    await queryMenu();
  });
</script>

<template>
  <div>
    <ConfigLoadGuard :ready="isReady" :failed="loadFailed" @retry="queryLoginConfig">
      <page-panel>
        <el-tabs v-model="activeTab">
          <!-- 微信登录配置 Tab -->
          <el-tab-pane name="login">
            <template #label>
              <div class="tab-label">
                <app-icon name="i-simple-icons:wechat" size="16" />
                <span>微信登录配置</span>
              </div>
            </template>

            <div class="content-panel">
              <el-form :rules="loginRules" :model="loginForm" label-width="170px">
                <el-row>
                  <el-col :xs="24" :md="20" :lg="15" :xl="12">
                    <el-form-item label="是否开启微信登录注册" prop="wechatRegisterStatus">
                      <el-tooltip
                        class="box-item"
                        effect="dark"
                        content="如您启用微信注册、则用户端则可以通过微信扫码方式注册或登录！"
                        placement="right"
                      >
                        <el-switch
                          :loading="saving('wechatRegisterStatus')"
                          v-model="loginForm.wechatRegisterStatus"
                          active-value="1"
                          inactive-value="0"
                          @change="(val: any) => saveField('wechatRegisterStatus', String(val))"
                        />
                      </el-tooltip>
                    </el-form-item>
                  </el-col>
                </el-row>
                <el-row>
                  <el-col :xs="24" :md="20" :lg="15" :xl="12">
                    <el-form-item label="是否开启微信静默" prop="wechatSilentLoginStatus">
                      <el-tooltip
                        class="box-item"
                        effect="dark"
                        content="如您启用静默登录、则用户在微信环境打开则直接自动登录！"
                        placement="right"
                      >
                        <el-switch
                          :loading="saving('wechatSilentLoginStatus')"
                          v-model="loginForm.wechatSilentLoginStatus"
                          active-value="1"
                          inactive-value="0"
                          @change="(val: any) => saveField('wechatSilentLoginStatus', String(val))"
                        />
                      </el-tooltip>
                    </el-form-item>
                  </el-col>
                </el-row>
                <el-row>
                  <el-col :xs="24" :md="20" :lg="15" :xl="12">
                    <el-form-item label="公众号名称" prop="wechatOfficialName">
                      <el-input
                        v-model="loginForm.wechatOfficialName"
                        placeholder="公众号名称"
                        clearable
                        @blur="saveField('wechatOfficialName', loginForm.wechatOfficialName)"
                      />
                    </el-form-item>
                  </el-col>
                </el-row>
                <el-row>
                  <el-col :xs="24" :md="20" :lg="15" :xl="12">
                    <el-form-item label="AppId" prop="wechatOfficialAppId">
                      <el-input
                        v-model="loginForm.wechatOfficialAppId"
                        placeholder="公众号开发信息 AppId"
                        clearable
                        type="password"
                        show-password
                        @blur="saveField('wechatOfficialAppId', loginForm.wechatOfficialAppId)"
                      />
                    </el-form-item>
                  </el-col>
                </el-row>
                <el-row>
                  <el-col :xs="24" :md="20" :lg="15" :xl="12">
                    <el-form-item label="Token" prop="wechatOfficialToken">
                      <el-input
                        v-model="loginForm.wechatOfficialToken"
                        placeholder="公众号Token配置"
                        clearable
                        type="password"
                        show-password
                        @blur="saveField('wechatOfficialToken', loginForm.wechatOfficialToken)"
                      />
                    </el-form-item>
                  </el-col>
                </el-row>
                <el-row>
                  <el-col :xs="24" :md="20" :lg="15" :xl="12">
                    <el-form-item label="AppSecret" prop="wechatOfficialAppSecret">
                      <el-input
                        v-model="loginForm.wechatOfficialAppSecret"
                        placeholder="公众号开发信息 AppSecret"
                        clearable
                        type="password"
                        show-password
                        @blur="
                          saveField('wechatOfficialAppSecret', loginForm.wechatOfficialAppSecret)
                        "
                      />
                    </el-form-item>
                  </el-col>
                </el-row>

                <el-divider content-position="left">微信开放平台网站登录</el-divider>
                <el-row>
                  <el-col :xs="24" :md="20" :lg="15" :xl="12">
                    <el-form-item label="开启网站登录" prop="wechatOpenWebLoginEnabled">
                      <el-tooltip
                        class="box-item"
                        effect="dark"
                        content="开启后，PC Web 登录弹窗优先使用微信开放平台网站应用登录。"
                        placement="right"
                      >
                        <el-switch
                          :loading="saving('wechatOpenWebLoginEnabled')"
                          v-model="loginForm.wechatOpenWebLoginEnabled"
                          active-value="1"
                          inactive-value="0"
                          @change="
                            (val: any) => saveField('wechatOpenWebLoginEnabled', String(val))
                          "
                        />
                      </el-tooltip>
                    </el-form-item>
                  </el-col>
                </el-row>
                <el-row>
                  <el-col :xs="24" :md="20" :lg="15" :xl="12">
                    <el-form-item label="网站应用 AppID" prop="wechatOpenWebAppId">
                      <el-input
                        v-model="loginForm.wechatOpenWebAppId"
                        placeholder="微信开放平台网站应用 AppID，不是公众号 AppID"
                        clearable
                        type="password"
                        show-password
                        @blur="saveField('wechatOpenWebAppId', loginForm.wechatOpenWebAppId)"
                      />
                    </el-form-item>
                  </el-col>
                </el-row>
                <el-row>
                  <el-col :xs="24" :md="20" :lg="15" :xl="12">
                    <el-form-item label="网站应用 AppSecret" prop="wechatOpenWebAppSecret">
                      <el-input
                        v-model="loginForm.wechatOpenWebAppSecret"
                        placeholder="微信开放平台网站应用 AppSecret，不是公众号 AppSecret"
                        clearable
                        type="password"
                        show-password
                        @blur="
                          saveField('wechatOpenWebAppSecret', loginForm.wechatOpenWebAppSecret)
                        "
                      />
                    </el-form-item>
                  </el-col>
                </el-row>
                <el-row>
                  <el-col :xs="24" :md="20" :lg="15" :xl="12">
                    <el-form-item label="网站登录回调地址" prop="wechatOpenWebCallbackUrl">
                      <el-input
                        v-model="loginForm.wechatOpenWebCallbackUrl"
                        placeholder="留空时使用网站地址 + /auth/callback/wechat_open_web"
                        clearable
                        @blur="
                          saveField('wechatOpenWebCallbackUrl', loginForm.wechatOpenWebCallbackUrl)
                        "
                      />
                    </el-form-item>
                  </el-col>
                </el-row>
                <el-row>
                  <el-col :xs="24" :md="20" :lg="15" :xl="12">
                    <el-form-item label="开启快捷确认" prop="wechatOpenWebFastLoginEnabled">
                      <el-tooltip
                        class="box-item"
                        effect="dark"
                        content="开启后由微信官方组件优先展示当前电脑微信快捷确认，仍可切换为扫码。"
                        placement="right"
                      >
                        <el-switch
                          :loading="saving('wechatOpenWebFastLoginEnabled')"
                          v-model="loginForm.wechatOpenWebFastLoginEnabled"
                          active-value="1"
                          inactive-value="0"
                          @change="
                            (val: any) => saveField('wechatOpenWebFastLoginEnabled', String(val))
                          "
                        />
                      </el-tooltip>
                    </el-form-item>
                  </el-col>
                </el-row>
                <el-row>
                  <el-col :xs="24" :md="20" :lg="15" :xl="12">
                    <el-form-item label="开启备用跳转" prop="wechatOpenWebFallbackEnabled">
                      <el-tooltip
                        class="box-item"
                        effect="dark"
                        content="开启后，微信官方组件加载失败时可使用后端生成的开放平台登录跳转地址。"
                        placement="right"
                      >
                        <el-switch
                          :loading="saving('wechatOpenWebFallbackEnabled')"
                          v-model="loginForm.wechatOpenWebFallbackEnabled"
                          active-value="1"
                          inactive-value="0"
                          @change="
                            (val: any) => saveField('wechatOpenWebFallbackEnabled', String(val))
                          "
                        />
                      </el-tooltip>
                    </el-form-item>
                  </el-col>
                </el-row>
                <el-divider content-position="left">自动回复消息配置</el-divider>
                <el-row>
                  <el-col :xs="24" :md="20" :lg="15" :xl="12">
                    <el-form-item label="订阅公众号欢迎消息" prop="officialSubscribeText">
                      <el-input
                        v-model="loginForm.officialSubscribeText"
                        type="textarea"
                        :rows="3"
                        placeholder="订阅你的公众号后对他的欢迎语！"
                        clearable
                        @blur="saveField('officialSubscribeText', loginForm.officialSubscribeText)"
                      />
                    </el-form-item>
                  </el-col>
                </el-row>
                <el-row>
                  <el-col :xs="24" :md="20" :lg="15" :xl="12">
                    <el-form-item label="绑定账号成功回复消息" prop="officialBindAccountText">
                      <el-input
                        v-model="loginForm.officialBindAccountText"
                        type="textarea"
                        :rows="3"
                        placeholder="非微信登录用户首次绑定微信成功时的欢迎语"
                        clearable
                        @blur="
                          saveField('officialBindAccountText', loginForm.officialBindAccountText)
                        "
                      />
                    </el-form-item>
                  </el-col>
                </el-row>
                <el-row>
                  <el-col :xs="24" :md="20" :lg="15" :xl="12">
                    <el-form-item label="绑定账号失败回复消息" prop="officialBindAccountFailText">
                      <el-input
                        v-model="loginForm.officialBindAccountFailText"
                        type="textarea"
                        :rows="3"
                        placeholder="绑定微信失败时的回复消息，如：该微信已被其他账号绑定"
                        clearable
                        @blur="
                          saveField(
                            'officialBindAccountFailText',
                            loginForm.officialBindAccountFailText,
                          )
                        "
                      />
                    </el-form-item>
                  </el-col>
                </el-row>
                <el-row>
                  <el-col :xs="24" :md="20" :lg="15" :xl="12">
                    <el-form-item label="扫码登录回复消息" prop="officialScanLoginText">
                      <el-input
                        v-model="loginForm.officialScanLoginText"
                        type="textarea"
                        :rows="3"
                        placeholder="用户扫码登录成功时自动回复的内容"
                        clearable
                        @blur="saveField('officialScanLoginText', loginForm.officialScanLoginText)"
                      />
                    </el-form-item>
                  </el-col>
                </el-row>
                <el-row>
                  <el-col :xs="24" :md="20" :lg="15" :xl="12">
                    <el-form-item label="自定义回复的默认信息" prop="officialAutoReplyText">
                      <el-input
                        v-model="loginForm.officialAutoReplyText"
                        type="textarea"
                        :rows="3"
                        placeholder="当用户对公众号发了消息不在自动回复列表时回复的兜底内容"
                        clearable
                        @blur="saveField('officialAutoReplyText', loginForm.officialAutoReplyText)"
                      />
                    </el-form-item>
                  </el-col>
                </el-row>
                <el-divider content-position="left">第三方代理服务配置（可选）</el-divider>
                <el-row>
                  <el-col :xs="24" :md="20" :lg="15" :xl="12">
                    <el-form-item label="微信开放平台 URL" prop="wechatOpenUrl">
                      <el-input
                        v-model="loginForm.wechatOpenUrl"
                        placeholder="默认: https://open.weixin.qq.com（用于网页授权）"
                        clearable
                        @blur="saveField('wechatOpenUrl', loginForm.wechatOpenUrl)"
                      />
                    </el-form-item>
                  </el-col>
                </el-row>
                <el-row>
                  <el-col :xs="24" :md="20" :lg="15" :xl="12">
                    <el-form-item label="微信 API 基础 URL" prop="wechatApiUrl">
                      <el-input
                        v-model="loginForm.wechatApiUrl"
                        placeholder="默认: https://api.weixin.qq.com（用于所有 API 调用）"
                        clearable
                        @blur="saveField('wechatApiUrl', loginForm.wechatApiUrl)"
                      />
                    </el-form-item>
                  </el-col>
                </el-row>
                <el-row>
                  <el-col :xs="24" :md="20" :lg="15" :xl="12">
                    <el-form-item label="微信公众平台 URL" prop="wechatMpUrl">
                      <el-input
                        v-model="loginForm.wechatMpUrl"
                        placeholder="默认: https://mp.weixin.qq.com（用于二维码展示）"
                        clearable
                        @blur="saveField('wechatMpUrl', loginForm.wechatMpUrl)"
                      />
                    </el-form-item>
                  </el-col>
                </el-row>
              </el-form>
            </div>
          </el-tab-pane>

          <!-- 微信公众号菜单 Tab -->
          <el-tab-pane name="menu">
            <template #label>
              <div class="tab-label">
                <app-icon name="i-lucide:menu" size="16" />
                <span>微信公众号菜单</span>
              </div>
            </template>

            <div class="content-panel">
              <!-- 菜单配置 Tab 的按钮 -->
              <div
                v-if="activeTab === 'menu'"
                class="mb-4 flex items-center justify-end gap-2 flex-nowrap"
              >
                <el-button
                  @click="addFirstLevelMenu"
                  :disabled="!wechatConfigured || menuForm.button.length >= 3"
                >
                  <AppIcon name="i-lucide:plus" />
                  添加
                </el-button>
                <el-button
                  type="danger"
                  plain
                  :loading="loading"
                  :disabled="!wechatConfigured"
                  @click="deleteMenu"
                >
                  <AppIcon name="i-lucide:trash-2" class="mr-1" />
                  清空菜单
                </el-button>
                <el-button
                  type="primary"
                  @click="saveMenu"
                  :loading="loading"
                  :disabled="!wechatConfigured"
                >
                  <AppIcon name="i-lucide:save" />
                  保存
                </el-button>
              </div>
              <el-alert
                v-if="!wechatConfigured"
                title="请先完成微信公众号基本配置"
                type="warning"
                :closable="false"
                show-icon
                style="margin-bottom: 20px"
              >
                <template #default>
                  请前往"微信登录配置"标签页完成 AppId、Token 和 AppSecret
                  的配置后，即可在此管理自定义菜单。
                </template>
              </el-alert>

              <!-- 主体内容区 -->
              <div class="main-content">
                <!-- 左侧手机预览 -->
                <div class="phone-preview-section">
                  <div class="phone-wrapper">
                    <div class="phone-body">
                      <div class="phone-screen">
                        <div class="phone-header">
                          <span class="back-btn">
                            <AppIcon name="i-lucide:chevron-left" />
                          </span>
                          <span class="header-title">{{
                            loginForm.wechatOfficialName || '公众号名称'
                          }}</span>
                          <span class="menu-icon">
                            <AppIcon name="i-lucide:ellipsis" />
                          </span>
                        </div>
                        <div class="phone-content">
                          <!-- 显示子菜单弹出层 -->
                          <div
                            v-if="
                              activeMenuIndex !== null &&
                              menuForm.button[activeMenuIndex]?.sub_button &&
                              menuForm.button[activeMenuIndex].sub_button.length > 0
                            "
                            class="submenu-popup"
                          >
                            <div
                              v-for="(subMenu, subIndex) in menuForm.button[activeMenuIndex]
                                .sub_button"
                              :key="subIndex"
                              class="submenu-item"
                              :class="{ active: activeSubMenuIndex === subIndex }"
                              @click.stop="selectMenu(activeMenuIndex, subIndex)"
                            >
                              {{ subMenu.name || `子菜单${subIndex + 1}` }}
                            </div>
                          </div>
                          <!-- 默认显示聊天内容区域 -->
                          <div v-else class="chat-placeholder">聊天内容区域</div>
                        </div>
                        <div class="phone-menu-bar">
                          <div
                            v-for="(menu, index) in menuForm.button"
                            :key="index"
                            class="menu-btn"
                            :class="{ active: activeMenuIndex === index }"
                            @click="selectMenu(index)"
                          >
                            {{ menu.name || '菜单' }}
                          </div>
                          <div v-if="menuForm.button.length === 0" class="menu-btn empty">
                            暂无菜单
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                <!-- 右侧配置表单 -->
                <div class="config-form-section">
                  <div class="form-card" v-if="currentMenuItem">
                    <h3 class="form-title">菜单信息</h3>

                    <el-form :model="currentMenuItem" label-position="top" size="default">
                      <!-- 名称 -->
                      <el-form-item label="名称" required>
                        <el-input
                          v-model="currentMenuItem.name"
                          placeholder="请输入菜单名称"
                          maxlength="16"
                          show-word-limit
                          @input="currentMenuItem.key = generateKey(currentMenuItem.name)"
                        />
                        <div class="form-hint">仅支持中文和数字，字数不超过4个汉字或8个字母。</div>
                      </el-form-item>

                      <!-- 菜单类型 -->
                      <el-form-item label="菜单类型" required>
                        <el-select v-model="currentMenuItem.type" placeholder="请选择菜单类型">
                          <el-option
                            v-for="item in menuTypes"
                            :key="item.value"
                            :label="item.label"
                            :value="item.value"
                          >
                            <span>{{ item.label }}</span>
                            <span
                              style="float: right; color: var(--u-text-secondary); font-size: 13px"
                              >{{ item.description }}</span
                            >
                          </el-option>
                        </el-select>
                      </el-form-item>

                      <!-- 回复文字 -->
                      <el-form-item
                        label="回复内容"
                        required
                        v-if="currentMenuItem.type === 'click'"
                      >
                        <el-input
                          v-model="currentMenuItem.content"
                          type="textarea"
                          :rows="4"
                          placeholder="请输入点击菜单后自动回复的文字内容"
                          maxlength="300"
                          show-word-limit
                        />
                        <div class="form-hint">
                          用户点击该菜单时，将自动回复此处设置的文字内容。
                        </div>
                      </el-form-item>

                      <!-- 跳转网页 -->
                      <el-form-item
                        label="网页链接"
                        required
                        v-if="currentMenuItem.type === 'view'"
                      >
                        <el-input
                          v-model="currentMenuItem.url"
                          placeholder="请输入完整的网页链接，以 https:// 开头"
                        />
                      </el-form-item>

                      <!-- 跳转小程序 -->
                      <template v-if="currentMenuItem.type === 'miniprogram'">
                        <el-form-item label="小程序AppID" required>
                          <el-input
                            v-model="currentMenuItem.appid"
                            placeholder="请输入小程序AppID"
                            maxlength="32"
                          />
                        </el-form-item>
                        <el-form-item label="页面路径" required>
                          <el-input
                            v-model="currentMenuItem.pagepath"
                            placeholder="pages/index/index"
                            maxlength="128"
                          />
                        </el-form-item>
                        <el-form-item label="备用网页">
                          <el-input
                            v-model="currentMenuItem.url"
                            placeholder="旧版微信打开的网页地址"
                          />
                        </el-form-item>
                      </template>

                      <!-- 图文素材 -->
                      <el-form-item
                        label="素材ID"
                        required
                        v-if="currentMenuItem.type === 'media_id'"
                      >
                        <div style="display: flex; gap: 8px">
                          <el-input
                            v-model="currentMenuItem.media_id"
                            placeholder="请输入或选择图文素材的media_id"
                            style="flex: 1"
                          />
                          <el-button type="primary" @click="openMaterialSelector"
                            >选择素材</el-button
                          >
                        </div>
                      </el-form-item>

                      <!-- 跳转图文消息（微信要求使用已发布素材的 media_id，链接无效） -->
                      <el-form-item
                        label="图文素材"
                        required
                        v-if="currentMenuItem.type === 'view_limited'"
                      >
                        <div style="display: flex; gap: 8px; width: 100%">
                          <el-input
                            v-model="currentMenuItem.media_id"
                            placeholder="请选择已发布图文素材（media_id）"
                            style="flex: 1"
                          />
                          <el-button type="primary" @click="openMaterialSelector"
                            >选择素材</el-button
                          >
                        </div>
                        <div class="form-hint">
                          微信要求“跳转图文消息”菜单使用已发布图文素材的
                          media_id，用户点击菜单后会打开该图文页面。
                        </div>
                      </el-form-item>
                    </el-form>

                    <!-- 删除菜单按钮 -->
                    <div class="form-footer">
                      <!-- 添加子菜单按钮（只在查看一级菜单且子菜单少于5个时显示） -->
                      <el-button
                        v-if="
                          activeSubMenuIndex === null &&
                          activeMenuIndex !== null &&
                          (!menuForm.button[activeMenuIndex].sub_button ||
                            menuForm.button[activeMenuIndex].sub_button.length < 5)
                        "
                        type="primary"
                        @click="addSecondLevelMenu(activeMenuIndex)"
                      >
                        <AppIcon name="i-lucide:plus" class="mr-1" />
                        添加子菜单
                      </el-button>

                      <div style="flex: 1"></div>

                      <el-button
                        type="danger"
                        text
                        @click="
                          removeMenuItem(
                            activeMenuIndex!,
                            activeSubMenuIndex !== null ? activeSubMenuIndex : undefined,
                          )
                        "
                      >
                        删除当前菜单
                      </el-button>
                    </div>
                  </div>

                  <div class="empty-state" v-else>
                    <el-empty description="请选择或添加菜单" />
                  </div>
                </div>
              </div>
            </div>
          </el-tab-pane>
        </el-tabs>
      </page-panel>

      <!-- 素材选择对话框 -->
      <el-dialog
        v-model="materialDialogVisible"
        title="选择素材"
        width="800px"
        :close-on-click-modal="false"
      >
        <div v-loading="materialLoading">
          <!-- 素材类型选择器 -->
          <div style="margin-bottom: 16px">
            <el-radio-group
              v-model="materialType"
              @change="handleMaterialTypeChange"
              size="default"
            >
              <el-radio-button label="news">图文消息</el-radio-button>
              <el-radio-button label="image">图片</el-radio-button>
              <el-radio-button label="video">视频</el-radio-button>
              <el-radio-button label="voice">语音</el-radio-button>
            </el-radio-group>
          </div>

          <el-empty
            v-if="materialList.length === 0 && !materialLoading"
            :description="`暂无${materialType === 'news' ? '图文' : materialType === 'image' ? '图片' : materialType === 'video' ? '视频' : '语音'}素材`"
          >
            <el-alert type="info" :closable="false" style="margin-top: 10px">
              <p style="margin: 0; font-size: 13px">
                请前往
                <a
                  href="https://mp.weixin.qq.com/"
                  target="_blank"
                  rel="noopener noreferrer"
                  style="color: var(--el-color-primary)"
                  >微信公众平台</a
                >
                素材管理页面创建图文素材
              </p>
            </el-alert>
          </el-empty>

          <div v-else class="material-list">
            <div
              v-for="(material, index) in materialList"
              :key="index"
              class="material-item"
              @click="selectMaterial(material)"
            >
              <div class="material-content">
                <!-- 图文消息 -->
                <div
                  v-if="
                    materialType === 'news' &&
                    material.content &&
                    material.content.news_item &&
                    material.content.news_item[0]
                  "
                  class="material-info"
                >
                  <div class="material-title">
                    {{ material.content.news_item[0].title || '无标题' }}
                  </div>
                  <div class="material-meta">
                    <span>{{ formatTime(material.update_time) }}</span>
                    <span v-if="material.content.news_item.length > 1" class="news-count">
                      共 {{ material.content.news_item.length }} 篇
                    </span>
                  </div>
                </div>

                <!-- 图片素材 -->
                <div v-else-if="materialType === 'image'" class="material-info">
                  <div class="material-title">{{ material.name || '未命名图片' }}</div>
                  <div class="material-meta">
                    <span>{{ formatTime(material.update_time) }}</span>
                  </div>
                </div>

                <!-- 视频素材 -->
                <div v-else-if="materialType === 'video'" class="material-info">
                  <div class="material-title">{{ material.name || '未命名视频' }}</div>
                  <div class="material-meta">
                    <span>{{ formatTime(material.update_time) }}</span>
                  </div>
                </div>

                <!-- 语音素材 -->
                <div v-else-if="materialType === 'voice'" class="material-info">
                  <div class="material-title">{{ material.name || '未命名语音' }}</div>
                  <div class="material-meta">
                    <span>{{ formatTime(material.update_time) }}</span>
                  </div>
                </div>

                <div class="material-id">media_id: {{ material.media_id }}</div>
              </div>
            </div>
          </div>

          <TablePager
            v-if="materialTotal > materialQuery.size"
            v-model:page="materialQuery.page"
            :size="materialQuery.size"
            :total="materialTotal"
            simple
            @change="loadMaterialList"
          />
        </div>
      </el-dialog>
    </ConfigLoadGuard>
  </div>
</template>

<style lang="scss" scoped>
  .tab-label {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 4px 0;
  }

  .content-panel {
    padding: 20px 0;
  }

  /* 主体内容 */
  .main-content {
    display: flex;
    gap: 24px;
    position: relative;
  }

  /* 左侧手机预览 */
  .phone-preview-section {
    flex-shrink: 0;
    width: 320px;
  }

  .phone-wrapper {
    position: sticky;
    top: 20px;
    padding: 24px;
  }

  .phone-body {
    border: 4px solid var(--u-text-primary);
    border-radius: 32px;
    overflow: hidden;
    box-shadow: var(--u-shadow-l);
    position: relative;
    background: var(--u-bg-container);
  }

  .phone-body::before {
    content: '';
    position: absolute;
    top: 12px;
    left: 50%;
    transform: translateX(-50%);
    width: 50px;
    height: 4px;
    background: var(--u-text-primary);
    border-radius: 2px;
    z-index: 10;
    opacity: 0.4;
  }

  .phone-screen {
    background: var(--u-bg-container);
    height: 560px;
    display: flex;
    flex-direction: column;
  }

  .phone-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 44px 16px 12px;
    background: var(--u-bg-fill);
    border-bottom: 1px solid var(--u-border-light);
  }

  .back-btn,
  .menu-icon {
    font-size: 18px;
    color: v-bind('WECHAT_BRAND_COLORS.wechatLink');
    cursor: pointer;
  }

  .header-title {
    font-size: 16px;
    font-weight: 600;
    color: var(--u-text-primary);
  }

  .phone-content {
    flex: 1;
    background: var(--u-bg-fill);
    display: flex;
    align-items: center;
    justify-content: center;
    position: relative;
  }

  .chat-placeholder {
    color: var(--u-text-secondary);
    font-size: 13px;
  }

  /* 子菜单弹出层 */
  .submenu-popup {
    position: absolute;
    bottom: 0;
    left: 0;
    right: 0;
    background: var(--u-bg-container);
    border-top-left-radius: 12px;
    border-top-right-radius: 12px;
    /* 底部弹层需要向上的投影作上沿分隔；不用向下的 --u-shadow-*（会被 .phone-body 裁掉） */
    box-shadow: 0 -2px 12px color-mix(in srgb, black 10%, transparent);
    animation: slideUp 0.3s ease-out;
  }

  @keyframes slideUp {
    from {
      transform: translateY(100%);
      opacity: 0;
    }
    to {
      transform: translateY(0);
      opacity: 1;
    }
  }

  .submenu-item {
    padding: 16px 20px;
    font-size: 14px;
    color: var(--u-text-primary);
    border-bottom: 1px solid var(--u-border-light);
    cursor: pointer;
    transition: all 0.2s;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .submenu-item:last-child {
    border-bottom: none;
    border-bottom-left-radius: 0;
    border-bottom-right-radius: 0;
  }

  .submenu-item:hover {
    background: var(--u-bg-fill);
  }

  .submenu-item.active {
    background: var(--el-color-primary-light-9);
    color: var(--el-color-primary);
    font-weight: 500;
  }

  .phone-menu-bar {
    display: flex;
    border-top: 1px solid var(--u-border-light);
    background: var(--u-bg-fill);
  }

  .menu-btn {
    flex: 1;
    padding: 13px 8px;
    text-align: center;
    font-size: 13px;
    color: var(--u-text-primary);
    font-weight: 500;
    border-right: 1px solid var(--u-border-light);
    cursor: pointer;
    transition: all 0.3s;
    position: relative;
  }

  .menu-btn:last-child {
    border-right: none;
  }

  .menu-btn:hover {
    background: var(--u-bg-fill);
  }

  .menu-btn.active {
    background: var(--u-border-light);
    color: var(--el-color-primary);
  }

  .menu-btn.active::after {
    content: '';
    position: absolute;
    bottom: 0;
    left: 0;
    right: 0;
    height: 2px;
    background: var(--el-color-primary);
  }

  .menu-btn.empty {
    color: var(--u-text-placeholder);
    cursor: default;
  }

  /* 右侧配置表单 */
  .config-form-section {
    flex: 1;
    min-height: 500px;
  }

  .form-card {
    padding: 24px;
  }

  .form-title {
    margin: 0 0 24px 0;
    font-size: 18px;
    font-weight: 600;
    color: var(--u-text-primary);
  }

  .form-hint {
    margin-top: 8px;
    font-size: 12px;
    color: var(--u-text-secondary);
    line-height: 1.5;
  }

  .form-hint-row {
    margin-top: 8px;
    display: flex;
    gap: 16px;
  }

  .form-footer {
    margin-top: 32px;
    padding-top: 20px;
    border-top: 1px solid var(--u-border-light);
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .empty-state {
    padding: 60px 24px;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  /* 素材选择对话框 */
  .material-list {
    display: grid;
    gap: 12px;
  }

  .material-item {
    border: 1px solid var(--u-border-light);
    border-radius: 8px;
    padding: 16px;
    cursor: pointer;
    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
    background: var(--u-bg-container);
    box-shadow: var(--u-shadow-s);
  }

  .material-item:hover {
    border-color: var(--el-color-primary);
    background: var(--el-color-primary-light-9);
    box-shadow: var(--u-shadow-m);
    transform: translateY(-2px);
  }

  .material-content {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  /* 素材信息区域 */
  .material-info {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  /* 素材标题 */
  .material-title {
    font-size: 14px;
    font-weight: 500;
    color: var(--u-text-primary);
    line-height: 1.5;
    overflow: hidden;
    text-overflow: ellipsis;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
  }

  /* 素材元数据 */
  .material-meta {
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-size: 12px;
    color: var(--u-text-secondary);
  }

  .news-count {
    color: var(--el-color-primary);
    font-weight: 500;
  }

  .material-id {
    font-size: 12px;
    color: var(--u-text-secondary);
    font-family: 'Monaco', 'Menlo', monospace;
    padding: 8px 12px;
    background: var(--u-bg-fill);
    border: 1px solid var(--u-border-light);
    border-radius: 6px;
    word-break: break-all;
    transition: all 0.2s;
  }

  .material-item:hover .material-id {
    background: var(--el-color-primary-light-9);
    border-color: var(--el-color-primary-light-8);
  }

  :deep(.el-tabs__content) {
    padding: 0;
  }

  :deep(.el-form-item) {
    margin-bottom: 22px;
  }

  :deep(.el-form-item__label) {
    font-weight: 500;
  }
</style>
