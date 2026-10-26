<script setup lang="ts">
import UiButton from '@/components/common/UiButton.vue'
import UiTooltip from '@/components/common/UiTooltip.vue'
import UiDialog from '@/components/common/UiDialog.vue'
import UiSpinner from '@/components/common/UiSpinner.vue'

import { CheckCircle, Gift, X } from '@lucide/vue'
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { fetchSignInAPI, fetchSignInStatusAPI, fetchSignLogAPI } from './api/signin'
import { useViewport } from '@/hooks/useViewport'
import { formatNumber, formatYearMonth, t } from '@/locales'
import { useAuthStore } from '@/store/modules/auth'
import { useCommerceStore } from './store'
import { message } from '@/utils/message'

interface SignLogItem {
  signInDate: string
  isSigned: boolean
}

const authStore = useAuthStore()
const commerceStore = useCommerceStore()
// 作为 chat.dialog 挂载点的全局弹窗，可见性由商业包自己的 store 决定
const visible = computed(() => commerceStore.signInDialog)
const { isMobile } = useViewport()
const ms = message()

const loading = ref(false)
const signing = ref(false)
const signLogs = ref<SignLogItem[]>([])

const signInEnabled = computed(() => Number(authStore.globalConfig?.signInStatus) === 1)
const signInCredits = computed(() => Number(authStore.globalConfig?.signInCredits || 0))
const consecutiveDays = ref(0)
/**
 * 当前日期：打开时取一次，打开期间每分钟再取一次（弹窗关了只是隐藏，长驻的页面会跨天、跨月）。
 * 日期一变就重新拉签到状态与当月记录；「今天是否已签」以服务端为准
 */
const now = ref(new Date())
const monthTitle = computed(() => formatYearMonth(now.value))

function dateKey(date: Date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}
const todayString = computed(() => dateKey(now.value))
/** 服务端给出的今天是否已签；不知道（没拉到、日期已变）时为 null，按当月记录判断 */
const signedTodayFromServer = ref<boolean | null>(null)
const loadFailed = ref(false)
/** 最近一次拉取是为哪一天发出的（还没回来也算） */
let requestedDay = ''
let loadSeq = 0
let dayTimer: ReturnType<typeof setInterval> | undefined

const isSignedToday = computed(
  () =>
    signedTodayFromServer.value ??
    signLogs.value.some(item => item.signInDate === todayString.value && item.isSigned)
)

const calendarDays = computed(() =>
  signLogs.value.map(item => ({
    ...item,
    day: item.signInDate.split('-').pop()?.replace(/^0/u, '') || '',
    isToday: item.signInDate === todayString.value,
  }))
)

const firstDayOfMonth = computed(() =>
  new Date(now.value.getFullYear(), now.value.getMonth(), 1).getDay()
)
const weekdayKeys = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const

const statusText = computed(() =>
  isSignedToday.value ? t('member.hasSignedIn') : t('member.signIn')
)
const dialogTitleId = 'sign-in-dialog-title'
const dialogDescriptionId = 'sign-in-dialog-description'
const calendarStatusId = 'sign-in-calendar-status'

function handleClose() {
  commerceStore.updateSignInDialog(false)
}

async function loadSignLog() {
  if (!authStore.isLogin || !signInEnabled.value) return

  // 只有最近一次的结果落地：跨天后重新拉取时，前一天发出、晚到的结果不覆盖今天的
  const seq = ++loadSeq
  requestedDay = todayString.value
  loading.value = true
  loadFailed.value = false
  try {
    const [logRes, statusRes] = await Promise.all([
      fetchSignLogAPI<any>(),
      fetchSignInStatusAPI<any>(),
    ])
    if (seq !== loadSeq) return
    signLogs.value = Array.isArray(logRes?.data) ? logRes.data : []
    consecutiveDays.value = Number(statusRes?.data?.consecutiveDays || 0)
    const signedToday = statusRes?.data?.signedToday
    signedTodayFromServer.value = typeof signedToday === 'boolean' ? signedToday : null
  } catch {
    if (seq !== loadSeq) return
    signLogs.value = []
    signedTodayFromServer.value = null
    loadFailed.value = true
  } finally {
    if (seq === loadSeq) loading.value = false
  }
}

/** 取当前日期；和上次拉取的那天不同了（跨天、跨月），就作废旧的「今天已签」并重新拉取 */
function refreshDay() {
  now.value = new Date()
  if (requestedDay && todayString.value !== requestedDay) {
    signedTodayFromServer.value = null
    void loadSignLog()
  }
}

function startDayWatch() {
  stopDayWatch()
  dayTimer = setInterval(refreshDay, 60_000)
}

function stopDayWatch() {
  if (dayTimer) clearInterval(dayTimer)
  dayTimer = undefined
}

let unmounted = false
const isOpen = () => visible.value && !unmounted

onBeforeUnmount(() => {
  unmounted = true
  stopDayWatch()
  loadSeq += 1
})

async function handleSignIn() {
  if (!signInEnabled.value || isSignedToday.value || signing.value) return

  signing.value = true
  try {
    await fetchSignInAPI()
    // 账户摘要是全站的，照常刷新；弹窗自己的签到记录只在弹窗还开着时重新拉
    await Promise.all([commerceStore.refreshBilling(), isOpen() ? loadSignLog() : undefined])
    ms.success(t('member.signInSuccess'))
  } catch {
    if (isOpen()) await loadSignLog()
  } finally {
    signing.value = false
  }
}

// 签到弹窗第一次打开时才挂载（挂载时 visible 已经是 true）：immediate，第一次也要检查登录、开关并加载签到记录
watch(
  visible,
  isVisible => {
    if (!isVisible) {
      // 关了只是隐藏：停掉日期检查，在途的拉取作废
      stopDayWatch()
      loadSeq += 1
      loading.value = false
      return
    }

    if (!authStore.isLogin || authStore.userInfo?.role === 'visitor') {
      handleClose()
      authStore.setLoginDialog(true)
      return
    }

    if (!signInEnabled.value) {
      handleClose()
      return
    }

    now.value = new Date()
    signedTodayFromServer.value = null
    void loadSignLog()
    startDayWatch()
  },
  { immediate: true }
)
</script>

<template>
  <UiDialog
    :open="visible"
    layer="dialog-elevated"
    class="flex max-h-[calc(100vh-2rem)] w-[min(30rem,calc(100vw-2rem))] flex-col overflow-hidden"
    :class="isMobile ? 'mx-4' : ''"
    :aria-labelledby="dialogTitleId"
    :aria-describedby="dialogDescriptionId"
    @close="handleClose"
  >
    <div class="flex items-center justify-between border-b border-app-divider p-4">
      <div class="flex items-center gap-2">
        <Gift :size="22" class="text-text-link" />
        <h3 :id="dialogTitleId" class="type-dialog-title">
          {{ t('member.signIn') }}
        </h3>
      </div>
      <UiTooltip :text="t('common.close')" placement="bottom">
        <UiButton icon type="button" :aria-label="t('common.close')" @click="handleClose">
          <X :size="20" />
        </UiButton>
      </UiTooltip>
    </div>

    <div class="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
      <div :id="dialogDescriptionId" class="settings-subtle-card p-3">
        <div class="flex items-center justify-between gap-3">
          <div class="min-w-0">
            <div class="type-control text-text-primary">
              {{ t('member.signInGift') }}
            </div>
            <div class="type-caption mt-1 text-text-muted">
              <i18n-t keypath="member.signInStreak" :plural="consecutiveDays" scope="global">
                <template #days>
                  <b class="text-text-link">{{ formatNumber(consecutiveDays) }}</b>
                </template>
              </i18n-t>
            </div>
          </div>
          <div class="text-right">
            <div class="type-caption text-text-muted">{{ t('member.credits') }}</div>
            <div class="type-section-title text-text-link">+{{ formatNumber(signInCredits) }}</div>
          </div>
        </div>
      </div>

      <div class="settings-card p-4">
        <div class="mb-3 flex items-center justify-between">
          <div class="type-section-title">{{ monthTitle }}</div>
          <div
            :id="calendarStatusId"
            class="type-control flex items-center gap-1 text-text-muted"
            aria-live="polite"
          >
            <CheckCircle v-if="isSignedToday" :size="16" class="text-text-link" />
            <span :class="isSignedToday ? 'text-text-link' : ''">
              {{ statusText }}
            </span>
          </div>
        </div>

        <div class="type-caption grid grid-cols-7 text-center text-text-muted">
          <div v-for="key in weekdayKeys" :key="key">{{ t(`member.${key}`) }}</div>
        </div>

        <div
          v-if="loading"
          class="ds-state-card ds-state-loading my-4"
          role="status"
          aria-live="polite"
          aria-busy="true"
        >
          <UiSpinner :size="14" class="mt-1" />
          <div class="ds-state-body">
            <div class="ds-state-title">{{ t('common.loading') }}</div>
            <div class="ds-state-description">{{ t('member.signIn') }}</div>
          </div>
        </div>

        <div v-else-if="loadFailed" class="ds-state-card my-4" role="alert">
          <div class="ds-state-body">
            <div class="ds-state-title">{{ t('member.signInLoadFailed') }}</div>
            <UiButton variant="secondary" type="button" class="mt-2" @click="loadSignLog">
              {{ t('common.retry') }}
            </UiButton>
          </div>
        </div>

        <div v-else class="type-control mt-2 grid grid-cols-7">
          <div v-for="n in firstDayOfMonth" :key="`empty-${n}`" class="py-2"></div>
          <div v-for="day in calendarDays" :key="day.signInDate" class="py-2">
            <div
              class="relative mx-auto flex h-8 w-8 items-center justify-center rounded-full transition-colors"
              :class="
                day.isToday
                  ? 'bg-accent text-text-on-accent'
                  : day.isSigned
                    ? 'text-text-link'
                    : 'text-text-primary'
              "
              :aria-current="day.isToday ? 'date' : undefined"
            >
              <time :datetime="day.signInDate">{{ day.day }}</time>
              <!-- 已签到不只靠颜色：数字下方一个小圆点，读屏读出「已签到」 -->
              <span
                v-if="day.isSigned"
                class="absolute bottom-0.5 h-1 w-1 rounded-full bg-current"
                aria-hidden="true"
              ></span>
              <span v-if="day.isSigned" class="sr-only">{{ t('member.hasSignedIn') }}</span>
            </div>
          </div>
        </div>

        <div class="mt-4 border-t border-app-divider pt-4">
          <UiButton
            variant="primary"
            type="button"
            class="w-full"
            :disabled="!signInEnabled || loading || signing || isSignedToday"
            :aria-busy="signing || undefined"
            @click="handleSignIn"
          >
            {{ signing ? t('member.signInLoading') : statusText }}
          </UiButton>
        </div>
      </div>
    </div>
  </UiDialog>
</template>
