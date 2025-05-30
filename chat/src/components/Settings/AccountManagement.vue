<script setup lang="ts">
import { fetchSendSms, fetchUpdateInfoAPI, fetchUpdatePasswordAPI } from '@/api'
import type { ResData } from '@/api/types'
import {
  fetchBindWxBySceneStrAPI,
  fetchGetQRCodeAPI,
  fetchGetQRSceneStrByBindAPI,
  fetchVerifyIdentityAPI,
  fetchVerifyPhoneIdentityAPI,
} from '@/api/user'
import defaultAvatar from '@/assets/avatar.png'
import { useBasicLayout } from '@/hooks/useBasicLayout'
import { useAuthStore, useGlobalStoreWithOut } from '@/store'
import { DIALOG_TABS } from '@/store/modules/global'
import { message } from '@/utils/message'
import { ArrowLeft, Edit, IdCard, Lock, Phone, User, Wechat } from '@icon-park/vue-next'
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import SliderCaptcha from '../Login/SliderCaptcha.vue'

interface Props {
  visible: boolean
}

const props = defineProps<Props>()

const authStore = useAuthStore()
const loading = ref(false)
const ms = message()
const showPasswordForm = ref(false)

const { isMobile } = useBasicLayout()

// 定义用户信息完整类型
interface UserInfo {
  username: string
  email: string
  role: string
  id: string | number
  avatar?: string
  sign?: string
  isBindWx: boolean
  consecutiveDays: number
  nickname?: string
  phone?: string
  realName?: string
  idCard?: string
}

// 获取用户信息和余额
const userInfo = computed(() => (authStore.userInfo as UserInfo) || ({} as UserInfo))

const emailLoginStatus = computed(() => Number(authStore.globalConfig.emailLoginStatus) === 1)
const wechatRegisterStatus = computed(
  () => Number(authStore.globalConfig.wechatRegisterStatus) === 1
)
const phoneLoginStatus = computed(() => Number(authStore.globalConfig.phoneLoginStatus) === 1)
const openIdentity = computed(() => Number(authStore.globalConfig.openIdentity) === 1)
const oldWechatMigrationStatus = computed(
  () => Number(authStore.globalConfig.oldWechatMigrationStatus) === 1
)

// 登录状态检测
const isLogin = computed(() => authStore.isLogin)

// 密码修改相关
const passwordForm = reactive({
  newPassword: '',
  confirmPassword: '',
})
const passwordError = ref('')
const reenteredPasswordError = ref('')
const isPasswordUpdating = ref(false)

// 处理密码修改表单提交
function handlePasswordFormSubmit() {
  console.log('开始密码修改流程')
  const { newPassword, confirmPassword } = passwordForm

  // 清空之前的错误信息
  passwordError.value = ''
  reenteredPasswordError.value = ''

  // 验证新密码
  if (!newPassword) {
    passwordError.value = '请输入新密码'
    return
  }

  // 验证密码格式
  if (newPassword.length < 8 || newPassword.length > 20) {
    passwordError.value = '密码长度必须在8-20个字符之间'
    return
  }
  if (!/[a-zA-Z]/.test(newPassword)) {
    passwordError.value = '密码必须包含字母'
    return
  }
  if (!/\d/.test(newPassword)) {
    passwordError.value = '密码必须包含数字'
    return
  }

  // 验证确认密码
  if (!confirmPassword) {
    reenteredPasswordError.value = '请再次输入新密码'
    return
  }
  if (newPassword !== confirmPassword) {
    reenteredPasswordError.value = '两次输入的密码不一致'
    return
  }

  // 所有验证通过，提交密码修改
  updatePassword()
}

async function updatePassword() {
  try {
    console.log('验证通过，开始提交密码修改请求')
    loading.value = true
    isPasswordUpdating.value = true

    const res: ResData = await fetchUpdatePasswordAPI({ password: passwordForm.newPassword })
    console.log('密码修改API响应:', {
      success: res.success,
      message: res.message,
    })

    loading.value = false
    isPasswordUpdating.value = false

    if (res.success) {
      console.log('密码修改成功，开始清理表单')
      ms.success('密码修改成功')
      // 重置密码表单
      passwordForm.newPassword = ''
      passwordForm.confirmPassword = ''
      // 返回主视图
      backToMainView()
      console.log('表单清理完成，状态已更新')
    } else {
      console.log('密码修改失败:', res.message)
      ms.error(res.message || '密码修改失败')
    }
  } catch (error) {
    console.log('密码修改过程出现异常:', error)
    loading.value = false
    isPasswordUpdating.value = false
    ms.error('密码修改失败')
  }
}

function resetForm() {
  passwordForm.newPassword = ''
  passwordForm.confirmPassword = ''
  passwordError.value = ''
  reenteredPasswordError.value = ''
}

// 登录检测函数
function checkLoginStatus() {
  console.log('检查登录状态:', isLogin.value)
  if (!isLogin.value) {
    console.log('用户未登录，关闭设置弹窗并打开登录弹窗')
    // 显示消息提醒
    ms.warning('请登录后使用账户管理')
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
    loading.value = true

    // 添加超时控制
    const timeout = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('获取用户信息超时')), 10000)
    )

    await Promise.race([authStore.getUserInfo(), timeout])

    loading.value = false
  } catch (error) {
    console.error('获取用户信息失败:', error)
    loading.value = false
    // 失败时也需要重置UI状态
    resetUiState()
  }
}

const avatar = computed(() => userInfo.value.avatar || defaultAvatar)
const email = computed(() => userInfo.value.email || '')
const nickname = computed(() => userInfo.value.nickname || '')
const phone = computed(() => userInfo.value.phone || '')
const realName = computed(() => userInfo.value.realName || '')

// 判断是否显示邮箱
const shouldShowEmail = computed(() => {
  if (!email.value) return false
  if (!emailLoginStatus.value) return false
  const excludeDomains = ['@aiweb.com', '@cooper.com', '@default.com']
  return !excludeDomains.some(domain => email.value.endsWith(domain))
})

// 个人信息编辑
const isEditingInfo = ref(false)
const editableNickname = ref('')

function startEditingInfo() {
  editableNickname.value = nickname.value
  isEditingInfo.value = true
}

function cancelEditingInfo() {
  isEditingInfo.value = false
}

async function saveUserInfo() {
  try {
    loading.value = true
    const res: ResData = await fetchUpdateInfoAPI({
      nickname: editableNickname.value,
    })
    loading.value = false

    if (!res.success) {
      ms.error(res.message || '更新失败')
      return
    }

    ms.success('个人信息更新成功')
    isEditingInfo.value = false
    await authStore.getUserInfo()
  } catch (error) {
    loading.value = false
    ms.error('更新失败')
  }
}

// 身份验证和手机验证相关
const showVerificationSection = ref(false) // 控制验证部分的展开/收起
const useGlobalStore = useGlobalStoreWithOut()
const globalConfig = computed(() => authStore.globalConfig)

// 身份认证
const isShowIdVerify = ref(false) // 身份验证滑块
const isShowPhoneVerify = ref(false) // 手机验证滑块

// 身份认证表单
const identityForm = ref({
  name: '',
  idCard: '',
})

// 手机认证表单
const phoneForm = ref({
  phone: '',
  code: '',
})

// 验证相关
const agreedToUserAgreement = ref(true) // 是否同意用户协议
const sendCodeLoading = ref(false)
const countdown = ref(0)
const timer = ref<number | null>(null)

// 微信绑定相关
// const countdownRef = ref<CountdownInst | null>()
const countdownRef = ref<number | null>(null)
const remainingTime = ref(60)
const isCountingDown = ref(false)
const activeCount = ref(false)
const wxLoginUrl = ref('')
const sceneStr = ref('')
const showWxBindSection = ref(false)
const wxBindTimer = ref<number | null>(null)
const isWxBound = computed(() => {
  return userInfo.value && Number(userInfo.value.isBindWx) === 1
})

// 当前显示视图控制
const activeView = ref('main') // 'main', 'phone', 'identity', 'wx', 'password', 'wxMigration'

// 切换到绑定手机界面
function showPhoneBindView() {
  activeView.value = 'phone'
}

// 切换到实名认证界面
function showIdentityView() {
  activeView.value = 'identity'
}

// 切换到微信绑定界面
function showWxBindView() {
  // 先清理之前可能存在的微信绑定资源
  cleanupWxBind()

  // 再切换视图
  activeView.value = 'wx'

  // 如果未绑定微信，获取场景字符串
  if (activeView.value === 'wx' && !isWxBound.value) {
    getSeneStr()
  }
}

// 返回主视图
function backToMainView() {
  // 如果是从微信绑定界面返回，立即清理微信绑定相关资源
  if (activeView.value === 'wx') {
    cleanupWxBind()
  }
  activeView.value = 'main'
}

// 切换验证区域展示

// 切换认证标签

// 切换到修改密码界面
function showPasswordView() {
  activeView.value = 'password'
}

// 点击"用户协议及隐私政策"时，自动同意
function handleAgreementClick() {
  agreedToUserAgreement.value = true // 设置为同意
  useGlobalStore.updateSettingsDialog(true, DIALOG_TABS.AGREEMENT)
}

// 身份认证提交
function handleIdentitySubmit() {
  if (agreedToUserAgreement.value === false && globalConfig.value.isAutoOpenAgreement === '1') {
    return ms.error(`请阅读并同意《${globalConfig.value.agreementTitle}》`)
  }
  isShowIdVerify.value = true
}

// 身份认证成功回调
function onIdentitySuccess() {
  isShowIdVerify.value = false
  fetchVerifyIdentityAPI(identityForm.value).then((res: any) => {
    if (res.code === 200) {
      ms.success('身份认证成功')
      getInfo() // 刷新用户信息
    } else {
      ms.error(res.message || '认证失败')
    }
  })
}

// 发送手机验证码
async function sendCode() {
  if (!phoneForm.value.phone) {
    return ms.error('请输入手机号')
  }

  if (countdown.value > 0) return

  try {
    sendCodeLoading.value = true
    const params = { phone: phoneForm.value.phone }
    const res: ResData = await fetchSendSms(params)

    if (res.success) {
      ms.success(res.data || '验证码已发送')
      countdown.value = 60
      startCountdown()
    } else {
      ms.error(res.message || '发送验证码失败')
    }
  } catch (error) {
    console.error('发送验证码失败:', error)
    ms.error('发送验证码失败，请稍后重试')
  } finally {
    sendCodeLoading.value = false
  }
}

// 开始倒计时
const startCountdown = () => {
  if (isCountingDown.value) return

  isCountingDown.value = true
  remainingTime.value = 60

  countdownRef.value = window.setInterval(() => {
    remainingTime.value--
    if (remainingTime.value <= 0) {
      clearInterval(countdownRef.value!)
      countdownRef.value = null
      isCountingDown.value = false
    }
  }, 1000)
}

// 停止倒计时
const stopCountdown = () => {
  if (countdownRef.value) {
    clearInterval(countdownRef.value)
    countdownRef.value = null
    isCountingDown.value = false
  }
}

// 手机认证验证
function handlePhoneSubmit() {
  if (agreedToUserAgreement.value === false && globalConfig.value.isAutoOpenAgreement === '1') {
    return ms.error(`请阅读并同意《${globalConfig.value.agreementTitle}》`)
  }

  if (!phoneForm.value.phone || !phoneForm.value.code) {
    return ms.error('请填写完整信息')
  }

  isShowPhoneVerify.value = true
}

// 手机认证成功回调
async function onPhoneSuccess() {
  isShowPhoneVerify.value = false
  try {
    loading.value = true

    // 使用正确的API进行手机认证
    const res = (await fetchVerifyPhoneIdentityAPI({
      phone: phoneForm.value.phone,
      code: phoneForm.value.code,
      username: '', // 这两个参数在绑定场景下可能不需要，但API定义需要
      password: '', // 这两个参数在绑定场景下可能不需要，但API定义需要
    })) as ResData

    if (res.success) {
      ms.success('手机认证成功')

      // 重置表单
      phoneForm.value.phone = ''
      phoneForm.value.code = ''

      // 刷新用户信息
      await getInfo()

      // 返回主视图
      backToMainView()
    } else {
      ms.error(res.message || '手机认证失败')
    }
  } catch (error) {
    console.error('手机认证失败:', error)
    ms.error('手机认证失败，请稍后重试')
  } finally {
    loading.value = false
  }
}

// 获取场景字符串
async function getSeneStr() {
  try {
    const res = (await fetchGetQRSceneStrByBindAPI()) as ResData
    if (res.success) {
      sceneStr.value = res.data
      getQrCodeUrl()
      // 开始倒计时
      startCountdown()
    }
  } catch (error) {
    console.error('获取场景字符串失败:', error)
  }
}

// 获取二维码URL
async function getQrCodeUrl() {
  try {
    const res = (await fetchGetQRCodeAPI({ sceneStr: sceneStr.value })) as ResData
    if (res.success) {
      activeCount.value = true
      wxLoginUrl.value = res.data
      // 使用window.setInterval并保存引用，以便清理
      if (wxBindTimer.value !== null) {
        clearInterval(wxBindTimer.value)
      }
      wxBindTimer.value = window.setInterval(() => {
        bindWxBySnece()
      }, 1000)
    }
  } catch (error) {
    console.error('获取二维码URL失败:', error)
  }
}

// 通过场景字符串绑定微信
async function bindWxBySnece() {
  if (!sceneStr.value) return
  try {
    const res = (await fetchBindWxBySceneStrAPI({
      sceneStr: sceneStr.value,
    })) as ResData
    if (res.data) {
      if (wxBindTimer.value !== null) {
        clearInterval(wxBindTimer.value)
        wxBindTimer.value = null
      }
      const { status, msg } = res.data
      if (status) {
        ms.success(msg)
        await authStore.getUserInfo()
        // 绑定成功后自动关闭微信绑定区域
        showWxBindSection.value = false
      }
    }
  } catch (error) {
    console.error('绑定微信失败:', error)
  }
}

// 倒计时结束处理
function handleTimeDown() {
  if (wxBindTimer.value !== null) {
    clearInterval(wxBindTimer.value)
    wxBindTimer.value = null
  }
  getSeneStr()
  // 使用自定义重置方法替换reset
  if (countdownRef.value) {
    clearInterval(countdownRef.value)
    countdownRef.value = null
    isCountingDown.value = false
    remainingTime.value = 60
  }
}

// 清理微信绑定相关资源
function cleanupWxBind() {
  console.log('清理微信绑定资源')
  if (wxBindTimer.value !== null) {
    clearInterval(wxBindTimer.value)
    wxBindTimer.value = null
  }
  wxLoginUrl.value = ''
  sceneStr.value = ''
  activeCount.value = false
}

// 取消绑定微信
async function unbindWx() {
  try {
    // 这里需要后端提供取消绑定的API
    // const res: ResData = await fetchUnbindWxAPI()
    // if (res.success) {
    //   ms.success('解绑成功')
    //   await authStore.getUserInfo()
    // }
    ms.warning('暂不支持解绑微信，请联系管理员')
  } catch (error) {
    console.error('解绑微信失败:', error)
  }
}

// 清理微信迁移相关资源
const wxMigrationTimer = ref<number | null>(null)

function cleanupWechatMigration() {
  if (wxMigrationTimer.value !== null) {
    clearInterval(wxMigrationTimer.value)
    wxMigrationTimer.value = null
  }
}

// 添加onBeforeUnmount钩子来清理资源
onBeforeUnmount(() => {
  // 重置加载状态
  loading.value = false

  // 清除任何可能正在运行的定时器
  if (timer.value !== null) {
    clearInterval(timer.value)
    timer.value = null
  }

  // 重置表单状态
  resetForm()

  // 关闭任何打开的验证对话框
  isShowIdVerify.value = false
  isShowPhoneVerify.value = false

  // 重置编辑状态
  isEditingInfo.value = false

  // 重置展开/折叠状态
  showVerificationSection.value = false
  showPasswordForm.value = false

  // 清理微信绑定相关资源
  cleanupWxBind()
  cleanupWechatMigration()
})

// 添加一个函数来重置UI状态
function resetUiState() {
  isEditingInfo.value = false
  showVerificationSection.value = false
  showPasswordForm.value = false
  showWxBindSection.value = false
  activeView.value = 'main' // 重置为主视图
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
      loading.value = false
      // 确保清理微信绑定的定时器
      cleanupWxBind()
    }
  }
)

// 监听登录状态变化
watch(isLogin, newLoginStatus => {
  console.log('登录状态变化:', newLoginStatus)
  // 如果组件可见但用户登出了，立即关闭设置弹窗并打开登录弹窗
  if (props.visible && !newLoginStatus) {
    console.log('用户已登出，关闭设置弹窗并打开登录弹窗')
    // 显示消息提醒
    ms.warning('账户已登出，请重新登录后查看')
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

// 手机号加密显示：123****7890
function maskPhone(phone: string): string {
  if (!phone || phone.length < 7) return phone
  return phone.replace(/(\d{3})\d*(\d{4})/, '$1****$2')
}

// 视图控制

// 手机绑定信息
const phoneBindInfo = reactive({
  status: computed(() => (phone.value ? 'bound' : 'unbound')),
  phone: computed(() => maskPhone(phone.value)),
})

// 实名认证状态
const identityStatus = computed(() => (realName.value ? 'verified' : 'unverified'))
</script>

<template>
  <div class="w-full">
    <!-- 主视图 -->
    <div
      v-if="activeView === 'main'"
      class="overflow-y-auto custom-scrollbar p-1"
      :class="{ 'max-h-[70vh]': !isMobile }"
    >
      <!-- 用户基本信息卡片 -->
      <div
        class="p-4 bg-white dark:bg-gray-700 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 mb-4 flex flex-col space-y-4"
      >
        <!-- 卡片标题 -->
        <div
          class="text-base font-semibold text-gray-900 dark:text-gray-100 mb-2 pb-2 border-b border-gray-200 dark:border-gray-700"
        >
          个人信息
        </div>

        <!-- 头像展示 -->
        <div class="flex items-center">
          <div class="w-20 text-gray-500 dark:text-gray-400">头像</div>
          <!-- <div>
            <img :src="avatar" alt="头像" class="w-20 h-20 rounded-full cursor-pointer" />
          </div> -->
          <div class="avatar avatar-lg avatar-bordered avatar-primary">
            <img v-if="avatar" :src="avatar" class="w-full h-full object-cover" alt="用户头像" />
            <User v-if="!avatar" theme="outline" size="20" class="text-white" aria-hidden="true" />
          </div>
        </div>

        <!-- 用户信息展示 - 每行一个信息 -->
        <!-- <div class="flex items-center">
          <div class="w-24 text-gray-500 dark:text-gray-400">用户名</div>
          <div class="text-gray-900 dark:text-gray-200">
            {{ username || '未设置' }}
          </div>
        </div> -->

        <div class="flex items-center">
          <div class="w-20 text-gray-500 dark:text-gray-400">昵称</div>
          <div v-if="!isEditingInfo" class="flex items-center">
            <div class="text-gray-900 dark:text-gray-200">
              {{ nickname || '未设置' }}
            </div>
            <div class="group relative ml-2">
              <button @click="startEditingInfo" class="btn-icon btn-sm" aria-label="编辑昵称">
                <Edit theme="outline" size="16" class="text-gray-500 hover:text-primary-600" />
              </button>
              <div class="tooltip tooltip-right">编辑</div>
            </div>
          </div>
          <div v-else class="flex items-center space-x-2">
            <input
              v-model="editableNickname"
              class="input input-md w-full"
              placeholder="请输入昵称"
            />
            <button @click="saveUserInfo" class="btn btn-primary btn-md">保存</button>
            <button @click="cancelEditingInfo" class="btn btn-secondary btn-md">取消</button>
          </div>
        </div>

        <div v-if="shouldShowEmail" class="flex items-center">
          <div class="w-20 text-gray-500 dark:text-gray-400">邮箱</div>
          <div class="text-gray-900 dark:text-gray-200">{{ email }}</div>
        </div>
      </div>

      <!-- 账户安全卡片 -->
      <div
        class="p-4 bg-white dark:bg-gray-700 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 mb-4 flex flex-col space-y-4"
      >
        <!-- 卡片标题 -->
        <div
          class="text-base font-semibold text-gray-900 dark:text-gray-100 mb-2 pb-2 border-b border-gray-200 dark:border-gray-700"
        >
          账户安全
        </div>

        <!-- 账户安全选项 -->
        <div class="grid grid-cols-1 gap-4">
          <!-- 手机绑定 -->
          <div v-if="phoneLoginStatus" class="flex items-center justify-between">
            <div class="flex items-center">
              <div>
                <div class="text-gray-900 dark:text-gray-200 flex items-center">
                  手机绑定
                  <Phone theme="outline" size="16" class="text-gray-500 ml-1" />
                </div>
                <div class="text-xs text-gray-500">
                  {{ phoneBindInfo.status === 'bound' ? '已绑定' : '未绑定' }}
                  {{ phoneBindInfo.phone || '' }}
                </div>
              </div>
            </div>
            <button
              v-if="phoneBindInfo.status !== 'bound'"
              @click="showPhoneBindView"
              class="btn btn-secondary btn-sm"
            >
              绑定
            </button>
            <span v-else class="text-green-600 text-sm">已绑定</span>
          </div>

          <!-- 微信绑定 -->
          <div v-if="wechatRegisterStatus" class="flex items-center justify-between">
            <div class="flex items-center">
              <div>
                <div class="text-gray-900 dark:text-gray-200 flex items-center">
                  微信绑定
                  <Wechat theme="outline" size="16" class="text-gray-500 ml-1" />
                </div>
                <div class="text-xs text-gray-500">
                  {{ isWxBound ? '已绑定微信' : '未绑定微信' }}
                </div>
              </div>
            </div>
            <button @click="showWxBindView" class="btn btn-secondary btn-sm" :disabled="isWxBound">
              {{ isWxBound ? '已绑定' : '绑定' }}
            </button>
          </div>

          <!-- 实名认证 -->
          <div v-if="openIdentity" class="flex items-center justify-between">
            <div class="flex items-center">
              <div>
                <div class="text-gray-900 dark:text-gray-200 flex items-center">
                  实名认证
                  <IdCard theme="outline" size="16" class="text-gray-500 ml-1" />
                </div>
                <div class="text-xs text-gray-500">
                  {{ identityStatus === 'verified' ? '已认证' : '未认证' }}
                </div>
              </div>
            </div>
            <button
              v-if="identityStatus !== 'verified'"
              @click="showIdentityView"
              class="btn btn-secondary btn-sm"
            >
              认证
            </button>
            <span v-else class="text-green-600 text-sm">已完成</span>
          </div>

          <!-- 修改密码 -->
          <div class="flex items-center justify-between">
            <div class="flex items-center">
              <div>
                <div class="text-gray-900 dark:text-gray-200 flex items-center">
                  账户密码
                  <Lock theme="outline" size="16" class="text-gray-500 ml-1" />
                </div>
                <div class="text-xs text-gray-500">定期修改密码可以保护账户安全</div>
              </div>
            </div>
            <button @click="showPasswordView" class="btn btn-secondary btn-sm">修改</button>
          </div>
        </div>
      </div>
    </div>

    <!-- 修改密码视图 -->
    <div
      v-else-if="activeView === 'password'"
      class="max-h-[70vh] overflow-y-auto custom-scrollbar p-2"
    >
      <!-- 修改密码卡片 -->
      <div
        class="p-4 bg-white dark:bg-gray-700 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 mb-4"
      >
        <!-- 卡片标题 -->
        <div class="flex items-center mb-4 pb-2 border-b border-gray-200 dark:border-gray-700">
          <button @click="backToMainView" class="text-gray-500 hover:text-gray-700 mr-2">
            <ArrowLeft size="18" />
          </button>
          <div class="text-base font-semibold text-gray-900 dark:text-gray-100">修改密码</div>
        </div>

        <form @submit.prevent="handlePasswordFormSubmit" class="flex flex-col space-y-4">
          <!-- 新密码 -->
          <div class="flex flex-col space-y-1">
            <label for="new-password" class="text-sm text-gray-700 dark:text-gray-300"
              >新密码</label
            >
            <input
              id="new-password"
              v-model="passwordForm.newPassword"
              type="password"
              placeholder="请输入新密码"
              class="input input-md w-full"
              required
            />
            <div class="text-xs text-gray-500">密码长度8-20个字符，必须包含字母和数字</div>
            <div v-if="passwordError" class="text-xs text-red-500 mt-1">{{ passwordError }}</div>
          </div>

          <!-- 确认新密码 -->
          <div class="flex flex-col space-y-1">
            <label for="confirm-password" class="text-sm text-gray-700 dark:text-gray-300"
              >确认新密码</label
            >
            <input
              id="confirm-password"
              v-model="passwordForm.confirmPassword"
              type="password"
              placeholder="请再次输入新密码"
              class="input input-md w-full"
              required
            />
            <div v-if="reenteredPasswordError" class="text-xs text-red-500 mt-1">
              {{ reenteredPasswordError }}
            </div>
          </div>

          <!-- 提交按钮 -->
          <div class="pt-2">
            <button
              type="submit"
              class="btn btn-primary btn-md w-full"
              :disabled="isPasswordUpdating"
            >
              <span v-if="isPasswordUpdating">提交中...</span>
              <span v-else>确认修改</span>
            </button>
          </div>
        </form>
      </div>
    </div>

    <!-- 手机绑定视图 -->
    <div
      v-else-if="activeView === 'phone'"
      class="max-h-[70vh] overflow-y-auto custom-scrollbar p-2"
    >
      <!-- 手机绑定卡片 -->
      <div
        class="p-4 bg-white dark:bg-gray-700 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 mb-4"
      >
        <!-- 卡片标题 -->
        <div class="flex items-center mb-4 pb-2 border-b border-gray-200 dark:border-gray-700">
          <button @click="backToMainView" class="text-gray-500 hover:text-gray-700 mr-2">
            <ArrowLeft size="18" />
          </button>
          <div class="text-base font-semibold text-gray-900 dark:text-gray-100">绑定手机号</div>
        </div>

        <div class="space-y-4">
          <div>
            <label class="block mb-1 text-sm font-medium text-gray-700 dark:text-gray-300">
              手机号码
            </label>
            <input
              v-model="phoneForm.phone"
              class="input input-md w-full"
              placeholder="请输入手机号码"
            />
          </div>
          <div class="flex space-x-2">
            <div class="flex-1">
              <label class="block mb-1 text-sm font-medium text-gray-700 dark:text-gray-300">
                验证码
              </label>
              <input
                v-model="phoneForm.code"
                class="input input-md w-full"
                placeholder="请输入验证码"
              />
            </div>
            <div class="flex items-end">
              <button
                @click="sendCode"
                class="btn btn-secondary btn-sm w-full"
                :disabled="sendCodeLoading || countdown > 0"
              >
                {{ countdown > 0 ? `${countdown}s后重新获取` : '获取验证码' }}
              </button>
            </div>
          </div>

          <div v-if="globalConfig.isAutoOpenAgreement === '1'" class="flex items-center">
            <input
              v-model="agreedToUserAgreement"
              type="checkbox"
              class="h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-600"
            />
            <p class="ml-1 text-center text-sm text-gray-500 dark:text-gray-400">
              已阅读并同意
              <a
                href="#"
                class="font-semibold leading-6 text-primary-600 hover:text-primary-500 dark:text-primary-500 dark:hover:text-primary-600"
                @click="handleAgreementClick"
                >《{{ globalConfig.agreementTitle }}》</a
              >
            </p>
          </div>

          <div>
            <button @click="handlePhoneSubmit" class="btn btn-primary btn-md w-full">
              提交认证
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- 实名认证视图 -->
    <div
      v-else-if="activeView === 'identity'"
      class="max-h-[70vh] overflow-y-auto custom-scrollbar p-2"
    >
      <!-- 实名认证卡片 -->
      <div
        class="p-4 bg-white dark:bg-gray-700 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 mb-4"
      >
        <!-- 卡片标题 -->
        <div class="flex items-center mb-4 pb-2 border-b border-gray-200 dark:border-gray-700">
          <button @click="backToMainView" class="text-gray-500 hover:text-gray-700 mr-2">
            <ArrowLeft size="18" />
          </button>
          <div class="text-base font-semibold text-gray-900 dark:text-gray-100">实名认证</div>
        </div>

        <div class="space-y-4">
          <div>
            <label class="block mb-1 text-sm font-medium text-gray-700 dark:text-gray-300">
              真实姓名
            </label>
            <input
              v-model="identityForm.name"
              class="input input-md w-full"
              placeholder="请输入真实姓名"
            />
          </div>
          <div>
            <label class="block mb-1 text-sm font-medium text-gray-700 dark:text-gray-300">
              身份证号
            </label>
            <input
              v-model="identityForm.idCard"
              class="input input-md w-full"
              placeholder="请输入身份证号"
            />
          </div>

          <div v-if="globalConfig.isAutoOpenAgreement === '1'" class="flex items-center">
            <input
              v-model="agreedToUserAgreement"
              type="checkbox"
              class="h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-600"
            />
            <p class="ml-1 text-center text-sm text-gray-500 dark:text-gray-400">
              已阅读并同意
              <a
                href="#"
                class="font-semibold leading-6 text-primary-600 hover:text-primary-500 dark:text-primary-500 dark:hover:text-primary-600"
                @click="handleAgreementClick"
                >《{{ globalConfig.agreementTitle }}》</a
              >
            </p>
          </div>

          <div>
            <button @click="handleIdentitySubmit" class="btn btn-primary btn-md w-full">
              提交认证
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- 微信绑定视图 -->
    <div v-else-if="activeView === 'wx'" class="max-h-[70vh] overflow-y-auto custom-scrollbar p-2">
      <!-- 微信绑定卡片 -->
      <div
        class="p-4 bg-white dark:bg-gray-700 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 mb-4"
      >
        <!-- 卡片标题 -->
        <div class="flex items-center mb-4 pb-2 border-b border-gray-200 dark:border-gray-700">
          <button @click="backToMainView" class="text-gray-500 hover:text-gray-700 mr-2">
            <ArrowLeft size="18" />
          </button>
          <div class="text-base font-semibold text-gray-900 dark:text-gray-100">绑定微信</div>
        </div>

        <!-- 已绑定状态 -->
        <div v-if="isWxBound" class="text-center py-6">
          <div class="text-green-500 text-lg mb-4">✓ 已成功绑定微信</div>
          <button @click="unbindWx" class="btn btn-secondary btn-sm">解除绑定</button>
        </div>

        <!-- 未绑定状态 -->
        <div v-else class="px-4 pt-2 pb-6">
          <!-- 绑定提示 -->
          <div class="text-center my-6">
            <p class="text-gray-700 dark:text-gray-300">
              请在
              <span class="text-red-500 font-medium">{{
                remainingTime > 0
                  ? `00:${remainingTime < 10 ? '0' + remainingTime : remainingTime}`
                  : '00:00'
              }}</span>
              时间内完成绑定
            </p>
          </div>

          <!-- 微信绑定页面的二维码显示 -->
          <div class="flex justify-center my-8">
            <div class="relative w-[200px] h-[200px]">
              <img
                v-if="
                  wxLoginUrl && (agreedToUserAgreement || globalConfig.isAutoOpenAgreement !== '1')
                "
                class="w-full h-full select-none shadow-sm rounded-lg object-cover border border-gray-100 dark:border-gray-700"
                :src="wxLoginUrl"
                alt="微信绑定二维码"
              />

              <div
                v-else
                class="w-full h-full rounded-lg bg-gray-200 dark:bg-gray-700 animate-pulse"
              ></div>

              <div
                v-if="!wxLoginUrl"
                class="absolute left-1/2 top-1/2 transform -translate-x-1/2 -translate-y-1/2"
              >
                <div
                  class="animate-spin rounded-full h-10 w-10 border-b-2 border-primary-600 dark:border-primary-400"
                ></div>
              </div>
            </div>
          </div>

          <!-- 提示文字 -->
          <div class="text-center text-gray-700 dark:text-gray-300 text-base">
            打开微信扫码绑定账户
          </div>
        </div>
      </div>
    </div>
  </div>

  <!-- 身份认证滑块验证 -->
  <SliderCaptcha
    :show="isShowIdVerify"
    @success="onIdentitySuccess"
    @close="isShowIdVerify = false"
  />

  <!-- 手机认证滑块验证 -->
  <SliderCaptcha
    :show="isShowPhoneVerify"
    @success="onPhoneSuccess"
    @close="isShowPhoneVerify = false"
  />
</template>

<style scoped>
.custom-scrollbar {
  scrollbar-width: thin;
  scrollbar-color: rgba(155, 155, 155, 0.5) transparent;
}

.custom-scrollbar::-webkit-scrollbar {
  width: 8px;
}

.custom-scrollbar::-webkit-scrollbar-track {
  background: transparent;
}

.custom-scrollbar::-webkit-scrollbar-thumb {
  background-color: rgba(155, 155, 155, 0.5);
  border-radius: 20px;
  border: transparent;
}

/* 暗黑模式下滚动条样式 */
.dark .custom-scrollbar::-webkit-scrollbar-thumb {
  background-color: rgba(100, 100, 100, 0.5);
}

.dark .custom-scrollbar {
  scrollbar-color: rgba(100, 100, 100, 0.5) transparent;
}
</style>
