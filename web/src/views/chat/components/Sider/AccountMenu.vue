<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { ChevronRight, CircleUser, LogOut, Settings, UserRound } from '@lucide/vue'
import DropdownMenu, { MenuItem } from '@/components/common/DropdownMenu'
import PackSlot from '@/components/common/PackSlot.vue'
import { useViewport } from '@/hooks/useViewport'
import { t } from '@/locales'
import { useAppStore } from '@/store/modules/app'
import { useAuthStore } from '@/store/modules/auth'
import { DIALOG_TABS, useGlobalStoreWithOut } from '@/store/modules/global'
import { confirmDialog } from '@/utils/dialog'

type MenuPosition =
  | 'bottom-left'
  | 'bottom-right'
  | 'bottom-center'
  | 'top-left'
  | 'top-right'
  | 'top-center'
  | 'auto'

const props = withDefaults(
  defineProps<{
    compact?: boolean
    menuPosition?: MenuPosition
    active?: boolean
  }>(),
  {
    compact: false,
    active: true,
  }
)

const menuOpen = ref(false)
const appStore = useAppStore()
const authStore = useAuthStore()
const globalStore = useGlobalStoreWithOut()
const { isMobile } = useViewport()

const avatar = computed(() => authStore.userInfo?.avatar || '')
const userDisplayName = computed(() => {
  const nickname = String(authStore.userInfo?.nickname || '').trim()
  const username = String(authStore.userInfo?.username || '').trim()
  return nickname || username || t('common.accountManagement')
})

watch(
  () => props.active,
  active => {
    if (!active) menuOpen.value = false
  }
)

function closeMenu() {
  menuOpen.value = false
}

function openSettings(tab: string) {
  closeMenu()
  globalStore.updateSettingsDialog(true, tab)
  if (isMobile.value) appStore.setSiderCollapsed(true)
}

function showLogoutConfirmation() {
  closeMenu()
  void confirmDialog({
    title: t('common.logout'),
    content: t('common.logoutConfirm'),
    positiveText: t('common.logout'),
    negativeText: t('common.cancel'),
    tone: 'danger',
    onPositiveClick: () => authStore.logOut(),
  })
}
</script>

<template>
  <div class="sidebar-account-menu-host" :class="{ 'is-compact': props.compact }">
    <DropdownMenu
      v-model="menuOpen"
      trigger="click"
      :position="props.menuPosition || (compact ? 'top-left' : 'top-center')"
      teleport
      menu-class="menu-account sidebar-account-menu"
      min-width="14rem"
      max-height="min(70vh, 30rem)"
      :content-aria-label="t('common.accountMenuLabel', { name: userDisplayName })"
    >
      <template #trigger="{ triggerProps }">
        <div class="chat-sidebar-account-profile" :class="{ 'is-compact': props.compact }">
          <button
            v-bind="triggerProps"
            type="button"
            class="chat-sidebar-account-trigger"
            :class="{ 'is-compact': props.compact }"
            :aria-label="t('common.accountMenuLabel', { name: userDisplayName })"
          >
            <span class="avatar avatar-bordered avatar-primary chat-sidebar-account-avatar">
              <img
                v-if="avatar"
                :src="avatar"
                class="h-full w-full object-cover"
                :alt="t('common.userAvatar')"
                draggable="false"
              />
              <CircleUser v-else :size="18" class="text-inherit" aria-hidden="true" />
            </span>

            <span v-if="!props.compact" class="chat-sidebar-account-text min-w-0 flex-1 text-left">
              <span class="chat-sidebar-account-name block truncate text-text-primary">{{
                userDisplayName
              }}</span>
              <span class="chat-sidebar-account-fallback block truncate">
                {{ t('common.accountManagement') }}
              </span>
            </span>
            <ChevronRight
              v-if="!props.compact"
              :size="18"
              class="chat-sidebar-account-chevron"
              aria-hidden="true"
            />
          </button>
          <div v-if="!props.compact" class="chat-sidebar-account-badge" @click.stop>
            <PackSlot name="sider.user" />
          </div>
        </div>
      </template>

      <template #menu>
        <div class="account-menu-body">
          <MenuItem
            class-name="account-menu-user"
            :title="userDisplayName"
            :description="t('common.accountManagement')"
            show-arrow
            @click="openSettings(DIALOG_TABS.ACCOUNT)"
          >
            <template #icon>
              <span class="avatar avatar-md avatar-bordered avatar-primary">
                <img
                  v-if="avatar"
                  :src="avatar"
                  class="h-full w-full object-cover"
                  :alt="t('common.userAvatar')"
                  draggable="false"
                />
                <CircleUser v-else :size="20" class="text-inherit" aria-hidden="true" />
              </span>
            </template>
          </MenuItem>

          <div class="account-menu-divider" role="separator"></div>

          <MenuItem :title="t('common.generalSettings')" @click="openSettings(DIALOG_TABS.GENERAL)">
            <template #icon>
              <Settings :size="18" aria-hidden="true" />
            </template>
          </MenuItem>
          <MenuItem
            :title="t('common.accountManagement')"
            @click="openSettings(DIALOG_TABS.ACCOUNT)"
          >
            <template #icon>
              <UserRound :size="18" aria-hidden="true" />
            </template>
          </MenuItem>

          <PackSlot name="header.menu" :extra="{ close: closeMenu }" />

          <div class="account-menu-divider" role="separator"></div>

          <MenuItem :title="t('common.logout')" danger @click="showLogoutConfirmation">
            <template #icon>
              <LogOut :size="18" aria-hidden="true" />
            </template>
          </MenuItem>
        </div>
      </template>
    </DropdownMenu>
  </div>
</template>
