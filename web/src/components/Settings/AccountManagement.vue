<script setup lang="ts">
import UiButton from '@/components/common/UiButton.vue'
import UiTooltip from '@/components/common/UiTooltip.vue'
import UiField from '@/components/common/UiField.vue'
import { passwordProblem, passwordRuleHint } from '@/constants/accountRules'
import { focusFirstInvalidField } from '@/utils/focus'

import { fetchUpdateInfoAPI, fetchUpdatePasswordAPI } from '@/api'
import type { ResData } from '@/api/types'
import PackSlot from '@/components/common/PackSlot.vue'
import { usePackSlot } from '@/components/common/usePackSlot'
import type { AuthIdentityView } from '@/api/user'
import { useAuthStore } from '@/store/modules/auth'
import { useGlobalStoreWithOut } from '@/store/modules/global'
import { message, notifyError } from '@/utils/message'
import { CircleUser, Lock, LogOut, SquarePen } from '@lucide/vue'
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import SettingsSubViewHeader from './SettingsSubViewHeader.vue'
import AccountIdentityRows from './identity/AccountIdentityRows.vue'
import CaptchaBindView from './identity/CaptchaBindView.vue'
import QrBindView from './identity/QrBindView.vue'
import { useAuthIdentities, type IdentityRow } from './identity/useAuthIdentities'
import { confirmDialog } from '@/utils/dialog'

interface Props {
  visible: boolean
}

const props = defineProps<Props>()

const authStore = useAuthStore()
// 扩展包贡献的「账户安全」行与对应子视图（account.security / account.view 挂载点，按 key 配对）
const securityEntries = usePackSlot('account.security')
const packViews = usePackSlot('account.view')
const ms = message()
const { t } = useI18n()
const mainViewRef = ref<HTMLElement | null>(null)
const passwordFormRef = ref<HTMLElement | null>(null)

// 定义用户信息完整类型
interface UserInfo {
  username: string
  role: string
  id: string | number
  avatar?: string
  nickname?: string
  identities?: AuthIdentityView[]
}

// 获取用户信息和余额
const userInfo = computed(() => (authStore.userInfo as UserInfo) || ({} as UserInfo))
const { rows: identityRows, load: loadIdentities } = useAuthIdentities()
// 登录状态检测
const isLogin = computed(() => authStore.isLogin)

// 密码修改相关
const passwordForm = reactive({
  oldPassword: '',
  newPassword: '',
  confirmPassword: '',
})
/** 各字段下方的就地错误与服务端拒绝的原因（规则以服务端为准，见 constants/accountRules） */
const passwordErrors = reactive({ old: '', next: '', confirm: '', form: '' })
const isPasswordUpdating = ref(false)

function clearPasswordErrors() {
  Object.assign(passwordErrors, { old: '', next: '', confirm: '', form: '' })
}

async function handlePasswordFormSubmit() {
  if (isPasswordUpdating.value) return
  clearPasswordErrors()
  const { oldPassword, newPassword, confirmPassword } = passwordForm
  if (!oldPassword) passwordErrors.old = t('settings.enterOldPassword')
  passwordErrors.next = newPassword ? passwordProblem(newPassword) : t('settings.enterNewPassword')
  if (!passwordErrors.next) {
    if (!confirmPassword) passwordErrors.confirm = t('settings.enterPasswordAgain')
    else if (newPassword !== confirmPassword)
      passwordErrors.confirm = t('settings.passwordNotMatch')
  }
  if (passwordErrors.old || passwordErrors.next || passwordErrors.confirm) {
    await nextTick()
    focusFirstInvalidField(passwordFormRef.value)
    return
  }
  void updatePassword()
}

async function updatePassword() {
  isPasswordUpdating.value = true
  try {
    const res: ResData = await fetchUpdatePasswordAPI(
      { oldPassword: passwordForm.oldPassword, password: passwordForm.newPassword },
      { silentError: true }
    )
    if (!res.success) {
      passwordErrors.form = res.message || t('settings.passwordChangeFailed')
      return
    }
    // 服务端改密后撤销了这个账号的全部登录会话（含当前这个）：按登录过期收尾，保留没发出去的草稿；
    // 关掉设置、打开登录框，用新密码重新登录，不再带着已失效的登录态继续操作
    backToMainView()
    useGlobalStore.updateSettingsDialog(false)
    authStore.removeToken()
    authStore.setLoginDialog(true)
    ms.success(t('settings.passwordChangeSuccess'))
  } catch (error) {
    passwordErrors.form =
      (error as { message?: string } | null)?.message || t('settings.passwordChangeFailed')
  } finally {
    isPasswordUpdating.value = false
  }
}

/** 离开改密视图时清空：再进来不留上次输入的密码和错误 */
function resetPasswordForm() {
  passwordForm.oldPassword = ''
  passwordForm.newPassword = ''
  passwordForm.confirmPassword = ''
  clearPasswordErrors()
}

// 登录检测函数
function checkLoginStatus() {
  if (!isLogin.value) {
    // 显示消息提醒
    ms.warning(t('settings.loginRequiredAccountManagement'))
    // 关闭设置弹窗
    useGlobalStore.updateSettingsDialog(false)
    // 打开登录弹窗
    authStore.setLoginDialog(true)
    return false
  }
  return true
}

async function getInfo() {
  // 首先检查登录状态
  if (!checkLoginStatus()) {
    return
  }

  try {
    // 添加超时控制
    const timeout = new Promise((_, reject) => {
      setTimeout(() => reject(new Error(t('settings.getUserInfoTimeout'))), 10000)
    })

    await Promise.race([authStore.getUserInfo(), timeout])
    await loadIdentities()
  } catch (error) {
    // 失败时也需要重置UI状态
    resetUiState()
  }
}

const avatar = computed(() => userInfo.value.avatar || '')
const nickname = computed(() => userInfo.value.nickname || '')

// 个人信息编辑
const isEditingInfo = ref(false)
const editableNickname = ref('')

const nicknameInputRef = ref<HTMLInputElement | null>(null)

/** 编辑键与输入框互相替换：切换后焦点跟过去，不掉回页面开头 */
function focusNicknameControl(editing: boolean) {
  void nextTick(() => {
    if (editing) nicknameInputRef.value?.focus()
    else mainViewRef.value?.querySelector<HTMLElement>('[data-nickname-edit]')?.focus()
  })
}

function startEditingInfo() {
  editableNickname.value = nickname.value
  isEditingInfo.value = true
  focusNicknameControl(true)
}

function cancelEditingInfo() {
  isEditingInfo.value = false
  focusNicknameControl(false)
}

async function saveUserInfo() {
  try {
    const res: ResData = await fetchUpdateInfoAPI({
      nickname: editableNickname.value,
    })

    if (!res.success) {
      ms.error(res.message || t('settings.updateFailed'))
      return
    }

    ms.success(t('settings.personalInfoUpdateSuccess'))
    isEditingInfo.value = false
    focusNicknameControl(false)
    await authStore.getUserInfo()
  } catch (error) {
    notifyError(error, t('settings.updateFailed'))
  }
}

const useGlobalStore = useGlobalStoreWithOut()
/** 当前正在绑定的登录方式（验证码 / 扫码类） */
const bindTarget = ref<IdentityRow | null>(null)

/** main / password / bind 是内核视图；其余是扩展包 account.view 的 key */
type AccountView = 'main' | 'password' | 'bind' | (string & {})

// 当前显示视图控制
const activeView = ref<AccountView>('main')
const activePackView = computed(() =>
  packViews.value.find(item => (item.key || item.id) === activeView.value)
)

/**
 * 打开子视图的那个按钮：返回主视图时焦点回到它（主视图用 v-show 常驻，按钮一直都在）。
 * 从别处直接带着子视图打开时没有来源，返回后焦点落到主视图上
 */
let subViewSource: string | null = null

/** 主视图里打开子视图的那一行（data-account-entry）：按行记，不记按钮节点——绑定成功后「绑定」会换成「解绑」 */
function entryRowOf(source: string) {
  const escaped = window.CSS?.escape ? window.CSS.escape(source) : source.replaceAll('"', '\\"')
  return mainViewRef.value?.querySelector<HTMLElement>(`[data-account-entry="${escaped}"]`)
}

function enterView(view: AccountView, source: string | null) {
  subViewSource = source
  activeView.value = view
}

// 返回主视图：焦点回到打开它的那一行的按钮；找不到（行没了）再落到主视图上
function backToMainView() {
  bindTarget.value = null
  resetPasswordForm()
  activeView.value = 'main'
  const source = subViewSource
  subViewSource = null
  void nextTick(() => {
    const button = source ? entryRowOf(source)?.querySelector<HTMLElement>('button') : null
    ;(button ?? mainViewRef.value)?.focus()
  })
}

// 进入验证码 / 扫码绑定视图；OAuth 类在行内直接跳转
function openBindView(row: IdentityRow) {
  bindTarget.value = row
  enterView('bind', `identity:${row.provider}`)
}

async function onIdentitiesChanged() {
  try {
    await authStore.getUserInfo()
    await loadIdentities()
  } catch {
    // 取不到时请求层已经提示；期间身份变了（换号、过期）静默结束，旧身份的列表不再刷新
  }
}

async function onBindDone() {
  await getInfo()
  backToMainView()
}

// 切换到修改密码界面
function showPasswordView() {
  enterView('password', 'password')
}

async function consumeRequestedAccountView() {
  if (!props.visible) return

  const requestedView = useGlobalStore.accountSettingsView as AccountView | undefined
  if (!requestedView) return

  useGlobalStore.updateAccountSettingsView()

  // 扩展包请求的子视图：对应的包未装载时回落主视图
  const isKernelView = requestedView === 'main' || requestedView === 'password'
  const hasPackView = packViews.value.some(item => (item.key || item.id) === requestedView)
  // 从别处直接带着子视图打开：返回时焦点落到对应的那一行
  subViewSource =
    requestedView === 'password' ? 'password' : hasPackView ? `pack:${requestedView}` : null
  activeView.value = isKernelView || hasPackView ? requestedView : 'main'
}

function showLogoutConfirmation() {
  void confirmDialog({
    title: t('common.logout'),
    content: t('common.logoutConfirm'),
    positiveText: t('common.logout'),
    negativeText: t('common.cancel'),
    tone: 'danger',
    onPositiveClick: () => {
      authStore.logOut()
    },
  })
}

onBeforeUnmount(() => {
  resetPasswordForm()
  isEditingInfo.value = false
})

/** 回到主视图、收起昵称编辑（设置关闭、取用户信息失败时） */
function resetUiState() {
  isEditingInfo.value = false
  bindTarget.value = null
  resetPasswordForm()
  subViewSource = null
  activeView.value = 'main'
}

// 监听visible属性变化，确保在组件变为不可见时重置状态
watch(
  () => props.visible,
  isVisible => {
    if (isVisible) {
      // 组件显示时立即检查登录状态
      if (checkLoginStatus()) {
        getInfo()
      }
    } else {
      // 当组件不可见时，重置所有状态
      resetUiState()
    }
  }
)

watch(
  [() => props.visible, () => useGlobalStore.accountSettingsView],
  () => {
    consumeRequestedAccountView()
  },
  { immediate: true }
)

// 监听登录状态变化
watch(isLogin, newLoginStatus => {
  // 如果组件可见但用户登出了，立即关闭设置弹窗并打开登录弹窗
  if (props.visible && !newLoginStatus) {
    // 显示消息提醒
    ms.warning(t('settings.loggedOutPleaseLogin'))
    useGlobalStore.updateSettingsDialog(false)
    authStore.setLoginDialog(true)
  }
})

onMounted(() => {
  // 组件挂载时检查登录状态
  if (checkLoginStatus()) {
    getInfo()
  }
})
</script>

<template>
  <div class="w-full">
    <!-- 主视图：常驻（v-show），从子视图返回时焦点能回到打开它的按钮上 -->
    <div v-show="activeView === 'main'" ref="mainViewRef" tabindex="-1" class="p-1">
      <!-- 用户基本信息卡片 -->
      <div class="settings-card mb-4 flex flex-col space-y-4 p-4">
        <!-- 卡片标题 -->
        <div class="settings-section-title mb-2 border-b border-app-divider pb-2">
          {{ t('settings.personalInfo') }}
        </div>

        <!-- 头像展示 -->
        <div class="flex items-center">
          <div class="settings-field-title w-20">{{ t('settings.avatar') }}</div>
          <div class="avatar avatar-lg avatar-bordered avatar-primary">
            <img
              v-if="avatar"
              :src="avatar"
              class="w-full h-full object-cover"
              :alt="t('common.userAvatar')"
            />
            <CircleUser v-if="!avatar" :size="20" class="text-inherit" aria-hidden="true" />
          </div>
        </div>

        <div class="flex items-center">
          <div class="settings-field-title w-20">{{ t('settings.nickname') }}</div>
          <div v-if="!isEditingInfo" class="flex items-center">
            <div class="settings-field-title">
              {{ nickname || t('settings.notSet') }}
            </div>
            <UiTooltip class="ml-2" :text="t('common.edit')" placement="right">
              <UiButton
                icon
                class="fg-quiet"
                data-nickname-edit
                @click="startEditingInfo"
                :aria-label="t('settings.editNickname')"
              >
                <SquarePen :size="16" />
              </UiButton>
            </UiTooltip>
          </div>
          <div v-else class="flex items-center space-x-2">
            <input
              ref="nicknameInputRef"
              v-model="editableNickname"
              class="input input-sm w-full"
              :aria-label="t('settings.nickname')"
              :placeholder="t('settings.enterNickname')"
            />
            <UiButton variant="primary" @click="saveUserInfo">
              {{ t('common.save') }}
            </UiButton>
            <UiButton variant="secondary" @click="cancelEditingInfo">
              {{ t('common.cancel') }}
            </UiButton>
          </div>
        </div>

        <PackSlot
          name="account.card"
          :extra="{ visible: props.visible && activeView === 'main' }"
        />
      </div>

      <!-- 账户安全卡片 -->
      <div class="settings-card mb-4 flex flex-col space-y-4 p-4">
        <!-- 卡片标题 -->
        <div class="settings-section-title mb-2 border-b border-app-divider pb-2">
          {{ t('settings.accountSecurity') }}
        </div>

        <!-- 账户安全选项 -->
        <div class="grid grid-cols-1 gap-4">
          <!-- 各登录方式的绑定 / 解绑（来自 /auth/providers 与已绑定身份） -->
          <AccountIdentityRows
            :rows="identityRows"
            @bind="openBindView"
            @changed="onIdentitiesChanged"
          />
          <!-- 扩展包贡献的安全项（如某渠道 Bot 的绑定入口）；包裹层不占布局，只用来标记来源行 -->
          <div
            v-for="entry in securityEntries"
            :key="entry.id"
            class="contents"
            :data-account-entry="`pack:${entry.key || entry.id}`"
          >
            <component
              :is="entry.view"
              v-bind="entry.props || {}"
              :visible="props.visible && activeView === 'main'"
              @open="enterView(entry.key || entry.id, `pack:${entry.key || entry.id}`)"
            />
          </div>

          <!-- 修改密码 -->
          <div class="flex items-center justify-between" data-account-entry="password">
            <div class="flex items-center">
              <div>
                <div class="settings-field-title flex items-center">
                  {{ t('settings.accountPassword') }}
                  <Lock :size="16" class="text-text-muted ml-1" />
                </div>
                <div class="settings-field-description">{{ t('settings.passwordSecurity') }}</div>
              </div>
            </div>
            <UiButton variant="secondary" @click="showPasswordView" class="min-w-[4.25rem]">
              {{ t('settings.modify') }}
            </UiButton>
          </div>
        </div>
      </div>

      <div class="settings-card mb-4 flex flex-col space-y-4 p-4">
        <div class="settings-section-title mb-2 border-b border-app-divider pb-2">
          {{ t('common.logout') }}
        </div>
        <div class="flex items-center justify-between gap-3">
          <div class="min-w-0">
            <div class="settings-field-title flex items-center">
              {{ t('common.logout') }}
              <LogOut :size="16" class="text-text-muted ml-1" />
            </div>
            <div class="settings-field-description">
              {{ t('common.logoutConfirm') }}
            </div>
          </div>
          <UiButton variant="danger" type="button" @click="showLogoutConfirmation">
            {{ t('common.logout') }}
          </UiButton>
        </div>
      </div>
    </div>

    <!-- 修改密码视图 -->
    <div v-if="activeView === 'password'" class="p-2">
      <div class="settings-card mb-4 p-4">
        <SettingsSubViewHeader :title="t('settings.changePassword')" @back="backToMainView" />

        <form
          ref="passwordFormRef"
          novalidate
          class="flex flex-col space-y-4"
          @submit.prevent="handlePasswordFormSubmit"
        >
          <UiField
            :label="t('settings.oldPassword')"
            :error="passwordErrors.old"
            v-slot="{ control }"
          >
            <input
              v-model="passwordForm.oldPassword"
              v-bind="control"
              type="password"
              autocomplete="current-password"
              :placeholder="t('settings.enterOldPassword')"
              class="input input-md w-full"
            />
          </UiField>
          <UiField
            :label="t('settings.newPassword')"
            :hint="passwordRuleHint()"
            :error="passwordErrors.next"
            v-slot="{ control }"
          >
            <input
              v-model="passwordForm.newPassword"
              v-bind="control"
              type="password"
              autocomplete="new-password"
              :placeholder="t('settings.enterNewPassword')"
              class="input input-md w-full"
            />
          </UiField>
          <UiField
            :label="t('settings.confirmNewPassword')"
            :error="passwordErrors.confirm"
            v-slot="{ control }"
          >
            <input
              v-model="passwordForm.confirmPassword"
              v-bind="control"
              type="password"
              autocomplete="new-password"
              :placeholder="t('settings.enterNewPasswordAgain')"
              class="input input-md w-full"
            />
          </UiField>
          <p v-if="passwordErrors.form" class="ds-form-helper ds-form-error" role="alert">
            {{ passwordErrors.form }}
          </p>

          <div class="pt-2">
            <UiButton
              variant="primary"
              type="submit"
              class="w-full"
              :disabled="isPasswordUpdating"
              :aria-busy="isPasswordUpdating || undefined"
            >
              <span v-if="isPasswordUpdating">{{ t('common.submitting') }}</span>
              <span v-else>{{ t('common.confirm') }}</span>
            </UiButton>
          </div>
        </form>
      </div>
    </div>

    <!-- 扩展包的子视图（如某渠道 Bot 的绑定面板） -->
    <component
      v-else-if="activePackView"
      :is="activePackView.view"
      v-bind="activePackView.props || {}"
      @back="backToMainView"
    />
    <!-- 验证码 / 扫码类登录方式的通用绑定视图 -->
    <CaptchaBindView
      v-else-if="activeView === 'bind' && bindTarget?.kind === 'captcha'"
      :provider="bindTarget.provider"
      :display-name="bindTarget.displayName"
      @back="backToMainView"
      @done="onBindDone"
    />
    <QrBindView
      v-else-if="activeView === 'bind' && bindTarget?.kind === 'qr'"
      :provider="bindTarget.provider"
      :display-name="bindTarget.displayName"
      @back="backToMainView"
      @done="onBindDone"
    />
  </div>
</template>
