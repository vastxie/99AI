<template>
  <UiDialog
    :open="visible"
    class="settings-dialog-shell overflow-hidden"
    :class="isMobile ? 'settings-dialog-shell-mobile dialog-shell-fullscreen' : 'dialog-shell-wide'"
    :close-on-backdrop="!isMobile"
    aria-labelledby="settings-dialog-title"
    @close="close"
  >
    <!-- 桌面：左侧页签 -->
    <aside v-if="!isMobile" class="settings-dialog-sidebar">
      <div class="settings-dialog-close-row">
        <UiTooltip :text="t('common.close')" placement="bottom">
          <UiButton
            icon
            type="button"
            class="settings-dialog-close"
            :aria-label="t('common.close')"
            @click="close"
          >
            <X :size="20" />
          </UiButton>
        </UiTooltip>
      </div>
      <div
        class="settings-pane settings-dialog-nav flex min-h-0 flex-1 flex-col overflow-y-auto custom-scrollbar"
        role="tablist"
        aria-orientation="vertical"
        :aria-label="t('common.settings')"
      >
        <button
          v-for="(tab, index) in tabs"
          :key="tab.id"
          :ref="el => setTabButtonRef(el, index)"
          type="button"
          role="tab"
          :id="tabButtonId(tab.id)"
          :aria-selected="tab.id === shownTab?.id"
          aria-controls="settings-dialog-panel"
          :tabindex="tab.id === shownTab?.id ? 0 : -1"
          class="settings-nav-item relative flex w-full items-center gap-3 cursor-pointer group text-left"
          :class="tab.id === shownTab?.id ? 'settings-nav-item-active' : 'text-text-secondary'"
          :title="tab.name"
          @click="selectTab(tab.id)"
          @keydown="handleTabKeydown($event, index)"
        >
          <span class="min-w-0 truncate">{{ tab.navName || tab.name }}</span>
        </button>
      </div>
    </aside>

    <section class="settings-dialog-content">
      <header class="settings-dialog-content-header">
        <UiTooltip
          v-if="isMobile && shownTab"
          class="mr-2"
          :text="t('common.back')"
          placement="bottom"
        >
          <UiButton icon type="button" :aria-label="t('common.back')" @click="showTabList">
            <ArrowLeft :size="20" />
          </UiButton>
        </UiTooltip>
        <h2
          id="settings-dialog-title"
          ref="titleRef"
          tabindex="-1"
          class="type-dialog-title min-w-0 flex-1 truncate"
        >
          {{ shownTab?.name || t('common.settings') }}
        </h2>
        <UiTooltip v-if="isMobile" :text="t('common.close')" placement="bottom">
          <UiButton icon type="button" :aria-label="t('common.close')" @click="close">
            <X :size="20" />
          </UiButton>
        </UiTooltip>
      </header>

      <!-- 手机：页签列表 -->
      <div
        v-if="!shownTab"
        class="settings-pane flex min-h-0 flex-grow flex-col overflow-y-auto px-4 py-4"
      >
        <div class="settings-card mb-3 flex items-center gap-3 p-3">
          <div class="avatar avatar-md avatar-bordered avatar-primary flex-shrink-0">
            <img
              v-if="avatar"
              :src="avatar"
              :alt="t('common.userAvatar')"
              class="h-full w-full rounded-full object-cover"
            />
            <CircleUser v-else :size="18" class="text-inherit" aria-hidden="true" />
          </div>
          <div class="min-w-0 flex-1">
            <div class="type-field-title truncate text-text-primary">{{ displayName }}</div>
            <PackSlot name="settings.mobile.badge" />
          </div>
        </div>
        <div class="settings-card overflow-hidden">
          <button
            v-for="tab in tabs"
            :key="tab.id"
            type="button"
            :data-settings-tab="tab.id"
            class="settings-nav-item flex w-full items-center gap-3 border-b border-app-divider px-3 py-3 text-left last:border-b-0"
            @click="selectTab(tab.id)"
          >
            <span
              class="settings-control-icon inline-flex h-9 w-9 flex-shrink-0 items-center justify-center border border-[color:var(--dialog-control-border)] bg-[var(--dialog-control-bg)] text-text-muted"
            >
              <component :is="tab.icon" :size="18" aria-hidden="true" />
            </span>
            <span class="settings-field-title min-w-0 flex-1 truncate text-text-primary">
              {{ tab.navName || tab.name }}
            </span>
            <ChevronRight :size="18" class="flex-shrink-0 text-text-muted" aria-hidden="true" />
          </button>
        </div>
      </div>

      <!-- 页签内容：桌面是 tabpanel，手机是列表进来的详情页 -->
      <div
        v-else
        id="settings-dialog-panel"
        ref="panelRef"
        class="settings-pane custom-scrollbar min-h-0 flex-1 overflow-y-auto overscroll-contain"
        :class="isMobile ? 'px-4 py-4' : 'settings-dialog-panel'"
        :role="isMobile ? undefined : 'tabpanel'"
        :aria-labelledby="isMobile ? undefined : tabButtonId(shownTab.id)"
        :tabindex="isMobile ? undefined : 0"
      >
        <transition name="fade" mode="out-in">
          <!-- 通用页：通用设置 + 个性设置，一起滚动 -->
          <div v-if="shownTab.merged" key="merged-general">
            <GeneralSettings :visible="visible" />
            <PersonalSettings :visible="visible" />
          </div>
          <keep-alive v-else>
            <component
              :is="shownTab.component"
              :key="shownTab.id"
              :visible="visible"
              v-bind="shownTab.props || {}"
            />
          </keep-alive>
        </transition>
      </div>
    </section>
  </UiDialog>
</template>

<script setup lang="ts">
import { ArrowLeft, ChevronRight, CircleUser, FileText, Megaphone, Settings, X } from '@lucide/vue'
import { computed, markRaw, nextTick, ref, watch } from 'vue'
import type { Component, ComponentPublicInstance } from 'vue'
import PackSlot from '@/components/common/PackSlot.vue'
import UiButton from '@/components/common/UiButton.vue'
import UiTooltip from '@/components/common/UiTooltip.vue'
import UiDialog from '@/components/common/UiDialog.vue'
import { usePackSlot } from '@/components/common/usePackSlot'
import { useViewport } from '@/hooks/useViewport'
import { t } from '@/locales'
import { useAuthStore } from '@/store/modules/auth'
import { DIALOG_TABS, useGlobalStoreWithOut } from '@/store/modules/global'
import AccountManagement from './Settings/AccountManagement.vue'
import AnnouncementSettings from './Settings/AnnouncementSettings.vue'
import GeneralSettings from './Settings/GeneralSettings.vue'
import PersonalSettings from './Settings/PersonalSettings.vue'

/**
 * 设置：桌面左侧页签、右侧内容；手机先是页签列表，点进去是详情页。一套页签表、一份状态
 * （global store 的 settingsDialog 与 settingsActiveTab），跨过断点时保持打开、停在同一页。
 * 未登录时不打开，改为拉起登录。
 */
const props = defineProps<{ visible: boolean }>()

const globalStore = useGlobalStoreWithOut()
const authStore = useAuthStore()
const { isMobile } = useViewport()
// 扩展包贡献的页签（settings.tab 挂载点）
const packTabs = usePackSlot('settings.tab')
const canOpenSettings = computed(() => authStore.isLogin && authStore.userInfo?.role !== 'visitor')
const globalConfig = computed(() => authStore.globalConfig)
const avatar = computed(() => authStore.userInfo?.avatar || '')
const displayName = computed(
  () => authStore.userInfo?.nickname || authStore.userInfo?.username || t('common.notLoggedIn')
)

interface SettingsTab {
  id: string
  name: string
  navName?: string
  icon: Component
  component: Component
  /** 通用页同时放「通用 + 个性设置」 */
  merged?: boolean
  props?: Record<string, unknown>
}

const tabs = computed<SettingsTab[]>(() => [
  {
    id: DIALOG_TABS.GENERAL,
    name: t('common.generalSettings'),
    navName: t('settings.navigation.general'),
    icon: markRaw(Settings),
    component: markRaw(GeneralSettings),
    merged: true,
  },
  {
    id: DIALOG_TABS.ACCOUNT,
    name: t('common.accountManagement'),
    navName: t('settings.navigation.account'),
    icon: markRaw(CircleUser),
    component: markRaw(AccountManagement),
  },
  ...packTabs.value.map(item => ({
    id: item.key ?? item.id,
    name: item.label?.() ?? item.key ?? item.id,
    navName: item.navigationLabel?.(),
    icon: markRaw(item.icon ?? Settings),
    component: item.view,
    props: item.props,
  })),
  {
    id: DIALOG_TABS.SERVICE,
    name: globalConfig.value.noticeTitle || t('common.platformNotice'),
    navName: t('settings.navigation.notices'),
    icon: markRaw(Megaphone),
    component: markRaw(AnnouncementSettings),
    props: { type: 'notice' },
  },
  {
    id: DIALOG_TABS.AGREEMENT,
    name: globalConfig.value.agreementTitle || t('common.userAgreement'),
    navName: t('settings.navigation.terms'),
    icon: markRaw(FileText),
    component: markRaw(AnnouncementSettings),
    props: { type: 'agreement' },
  },
])

/** 当前显示的页签；没指定时桌面停在第一页，手机停在列表（null） */
const shownTab = computed(() => {
  const selected = tabs.value.find(tab => tab.id === globalStore.settingsActiveTab)
  return selected ?? (isMobile.value ? null : tabs.value[0])
})

const titleRef = ref<HTMLElement | null>(null)
const panelRef = ref<HTMLElement | null>(null)
const tabButtonRefs = ref<HTMLElement[]>([])
/**
 * 手机上从列表进入的页签：返回列表时焦点回到它。从账户菜单等入口直接带着页签打开时没有记录，
 * 返回时按当前页签找；都找不到时落到列表第一项
 */
let enteredFromList: string | null = null

function tabButtonId(id: string) {
  return `settings-dialog-tab-${id}`
}

function setTabButtonRef(el: Element | ComponentPublicInstance | null, index: number) {
  if (el instanceof HTMLElement) tabButtonRefs.value[index] = el
}

function selectTab(id: string) {
  if (isMobile.value) enteredFromList = id
  globalStore.updateSettingsActiveTab(id)
  // 手机进入详情：焦点落到标题，读屏从新页开头读
  if (isMobile.value) void nextTick(() => titleRef.value?.focus())
}

function showTabList() {
  const from = enteredFromList ?? shownTab.value?.id ?? null
  enteredFromList = null
  globalStore.updateSettingsActiveTab(undefined)
  void nextTick(() => {
    const target =
      (from && document.querySelector<HTMLElement>(`[data-settings-tab="${from}"]`)) ||
      document.querySelector<HTMLElement>('[data-settings-tab]')
    target?.focus()
  })
}

function handleTabKeydown(event: KeyboardEvent, index: number) {
  const lastIndex = tabs.value.length - 1
  const targets: Record<string, number> = {
    ArrowUp: index <= 0 ? lastIndex : index - 1,
    ArrowLeft: index <= 0 ? lastIndex : index - 1,
    ArrowDown: index >= lastIndex ? 0 : index + 1,
    ArrowRight: index >= lastIndex ? 0 : index + 1,
    Home: 0,
    End: lastIndex,
  }
  const target = targets[event.key]
  if (target === undefined || lastIndex < 0) return
  event.preventDefault()
  selectTab(tabs.value[target].id)
  void nextTick(() => tabButtonRefs.value[target]?.focus())
}

function close() {
  globalStore.updateSettingsDialog(false)
}

// 页签共用滚动容器，新页从顶部开始；账户子视图仍保留自身的返回焦点行为。
watch(
  () => shownTab.value?.id,
  () => {
    if (panelRef.value) panelRef.value.scrollTop = 0
  },
  { flush: 'post' }
)

watch(
  () => props.visible,
  visible => {
    enteredFromList = null
    if (visible && !canOpenSettings.value) {
      close()
      authStore.setLoginDialog(true)
    }
  },
  { immediate: true }
)

// 跨过断点时停在同一页：桌面没选页签时显示的是第一页，缩到手机宽度也还是它（返回键回到列表）
watch(isMobile, mobile => {
  if (mobile && props.visible && !globalStore.settingsActiveTab && tabs.value[0]) {
    globalStore.updateSettingsActiveTab(tabs.value[0].id)
  }
})
</script>

<style scoped>
.fade-enter-active,
.fade-leave-active {
  transition: opacity var(--motion-duration-md) var(--motion-easing);
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

@media (prefers-reduced-motion: reduce) {
  .fade-enter-active,
  .fade-leave-active {
    transition: none;
  }
}
</style>
