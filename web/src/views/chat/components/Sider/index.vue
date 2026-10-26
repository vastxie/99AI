<script setup lang="ts">
import UiButton from '@/components/common/UiButton.vue'

import logo from '@/assets/logo.png'
import ActionIcon from '@/components/common/ActionIcon/index.vue'
import PackSlot from '@/components/common/PackSlot.vue'
import { useDialogA11y } from '@/composables/useDialogA11y'
import { useViewport } from '@/hooks/useViewport'
import { t } from '@/locales'
import { useAppStore } from '@/store/modules/app'
import { useAuthStore } from '@/store/modules/auth'
import { useGlobalStoreWithOut } from '@/store/modules/global'
import { CircleUser } from '@lucide/vue'
import { computed, ref, watch } from 'vue'
import { useConversationNavigator } from '../../composables/useConversationNavigator'
import AccountMenu from './AccountMenu.vue'
import List from './List.vue'
import SearchDialog from './SearchDialog.vue'
import SidebarIcon from './SidebarIcon.vue'

const useGlobalStore = useGlobalStoreWithOut()

const appStore = useAppStore()
const authStore = useAuthStore()
const navigation = useConversationNavigator()

const railSearchDialog = ref(false)

const { isMobile } = useViewport()
const isLogin = computed(() => authStore.isLogin)
const logoPath = computed(() => authStore.globalConfig.clientLogoPath || logo)
const siteName = authStore.globalConfig?.siteName || '99Agent'

const isCollapsed = computed(() => appStore.siderCollapsed)
/** 桌面端收起后只留一条图标栏 */
const showDesktopRail = computed(() => !isMobile.value && isCollapsed.value)
/**
 * 移动端抽屉打开时按对话框处理：Esc 关闭、焦点移入并困在抽屉里、关闭后还给打开它的按钮
 * （焦点已经在上层弹窗里时不抢）。桌面侧栏不带对话框语义，也不困焦点
 */
const isDrawerOpen = computed(() => isMobile.value && !isCollapsed.value)
const { setDialogRef: setDrawerRef, dialogAttrs: drawerDialogAttrs } = useDialogA11y(isDrawerOpen, {
  onClose: () => appStore.setSiderCollapsed(true),
})
const isCodeWorkspaceOpen = computed(() => useGlobalStore.rightPreviewPanel?.type === 'code')

function toggleSidebar() {
  appStore.setSiderCollapsed(!isCollapsed.value)
}

function expandSidebarFromRail() {
  if (showDesktopRail.value) {
    appStore.setSiderCollapsed(false)
  }
}

function openConversationFromRail() {
  void navigation.startNewConversation()
}

function openSearchFromRail() {
  useGlobalStore.updateSettingsDialog(false)
  railSearchDialog.value = true
  if (isMobile.value) appStore.setSiderCollapsed(true)
}

function openLoginDialog() {
  authStore.setLoginDialog(true)
}

// 侧栏跟随视口：移动端是默认收起的抽屉，桌面端默认展开；进来时先按当前视口设好，之后随视口切换
appStore.setSiderCollapsed(isMobile.value)
watch(isMobile, mobile => appStore.setSiderCollapsed(mobile))
</script>

<template>
  <div>
    <div
      id="chat-sidebar"
      :ref="setDrawerRef"
      v-bind="isDrawerOpen ? drawerDialogAttrs : {}"
      :aria-label="isDrawerOpen ? t('common.sidebar') : undefined"
      class="chat-sidebar-frame fixed top-0 left-0 h-full"
      :aria-hidden="isMobile && isCollapsed ? 'true' : undefined"
      :inert="isMobile && isCollapsed ? true : undefined"
      :class="[
        isMobile ? 'w-[260px]' : showDesktopRail ? 'w-14' : 'w-[260px]',
        isMobile && isCollapsed ? '-translate-x-full' : 'translate-x-0',
        isMobile ? 'is-drawer' : 'z-sidebar',
      ]"
    >
      <div
        class="chat-sidebar-surface flex flex-col h-full select-none"
        :class="{ 'is-collapsed-rail': showDesktopRail }"
      >
        <div class="chat-sidebar-brand" :class="{ 'is-collapsed': showDesktopRail }">
          <img :src="logoPath" class="chat-sidebar-brand-logo" :alt="siteName" draggable="false" />
          <button
            v-show="showDesktopRail"
            type="button"
            class="chat-sidebar-brand-expand"
            :aria-label="t('common.expandSidebar')"
            aria-controls="chat-sidebar"
            :aria-expanded="!isCollapsed"
            @click.stop="toggleSidebar"
          >
            <SidebarIcon name="sidebar" />
          </button>
          <span class="chat-sidebar-brand-name">{{ siteName }}</span>
        </div>

        <main
          class="chat-sidebar-layer chat-sidebar-rail group/rail flex h-full flex-col items-center px-1 py-0"
          :class="{ 'is-active': showDesktopRail }"
          :aria-hidden="showDesktopRail ? undefined : 'true'"
          :inert="showDesktopRail ? undefined : true"
          @click.self="expandSidebarFromRail"
        >
          <div
            aria-hidden="true"
            class="chat-sidebar-rail-expand-hotspot cursor-e-resize"
            @click.stop="toggleSidebar"
          ></div>

          <div
            class="chat-sidebar-header flex w-full flex-shrink-0 items-center justify-center"
            aria-hidden="true"
          ></div>

          <div v-if="isLogin" class="flex flex-col items-center gap-3">
            <ActionIcon
              :scale="false"
              :label="t('common.newConversation')"
              :tooltip="t('common.newConversation')"
              tooltip-placement="right"
              @click.stop="openConversationFromRail"
            >
              <SidebarIcon name="new-chat" />
            </ActionIcon>

            <ActionIcon
              :scale="false"
              :label="t('common.search')"
              :tooltip="t('common.search')"
              tooltip-placement="right"
              @click.stop="openSearchFromRail"
            >
              <SidebarIcon name="search" />
            </ActionIcon>

            <div @click.stop>
              <PackSlot name="sider.rail" />
            </div>
          </div>

          <div class="mt-auto flex w-full justify-center pb-1" @click.stop>
            <AccountMenu v-if="isLogin" compact :active="showDesktopRail" />

            <ActionIcon
              v-else
              :label="t('common.login')"
              :tooltip="t('common.login')"
              tooltip-placement="right"
              @click.stop="openLoginDialog"
            >
              <CircleUser :size="20" aria-hidden="true" />
            </ActionIcon>
          </div>
        </main>

        <main
          class="chat-sidebar-layer chat-sidebar-expanded flex h-full flex-col"
          :class="{ 'is-active': !showDesktopRail }"
          :aria-hidden="showDesktopRail ? 'true' : undefined"
          :inert="showDesktopRail ? true : undefined"
        >
          <div
            class="chat-sidebar-header flex w-full flex-shrink-0 items-center justify-end gap-2 px-3"
          >
            <ActionIcon
              v-if="isLogin"
              :scale="false"
              :label="t('common.search')"
              :tooltip="t('common.search')"
              tooltip-placement="bottom"
              @click="openSearchFromRail"
            >
              <SidebarIcon name="search" />
            </ActionIcon>
            <ActionIcon
              :scale="false"
              :label="t('common.collapseSidebar')"
              :tooltip="!isCodeWorkspaceOpen ? t('common.collapseSidebar') : undefined"
              tooltip-placement="bottom"
              aria-controls="chat-sidebar"
              :aria-expanded="!isCollapsed"
              @click="toggleSidebar"
            >
              <SidebarIcon name="sidebar" />
            </ActionIcon>
          </div>
          <div class="flex-1 min-h-0 overflow-hidden">
            <List />
          </div>
          <div
            class="chat-sidebar-footer flex w-full flex-shrink-0 justify-between text-left"
            :class="isLogin ? 'h-16 items-center px-2 py-2' : 'h-14 items-center px-2'"
          >
            <AccountMenu v-if="isLogin" :active="!showDesktopRail && !(isMobile && isCollapsed)" />

            <!-- 未登录用户 -->
            <div
              v-if="!isLogin"
              @click="openLoginDialog"
              class="flex flex-1 items-center justify-center cursor-pointer"
            >
              <UiButton pill type="button" class="w-full" :aria-label="t('common.login')">
                <span>{{ t('common.login') }}</span>
              </UiButton>
            </div>
          </div>
        </main>
      </div>
    </div>

    <SearchDialog v-model="railSearchDialog" />

    <!-- 移动端抽屉打开时盖住页面，点一下收起 -->
    <Transition name="sidebar-scrim">
      <div
        v-if="isMobile && !isCollapsed"
        class="chat-sidebar-scrim"
        aria-hidden="true"
        @click="toggleSidebar"
      />
    </Transition>
  </div>
</template>
