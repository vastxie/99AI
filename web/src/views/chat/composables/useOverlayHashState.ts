import { historyBack, runInHistoryQueue, whenHistorySettled } from '@/composables/useHistoryLayer'
import { packOverlays } from '@/packs'
import { useAuthStore } from '@/store/modules/auth'
import { DIALOG_TABS, useGlobalStoreWithOut } from '@/store/modules/global'
import { computed, nextTick, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'

/**
 * 覆盖层（登录 / 设置 / 扩展包弹窗）与路由 hash 的双向同步。
 *
 * 内核只认识 #login / #register 与 #settings[/<页签>]；扩展包的弹窗经 packOverlays() 登记自己的 hash，
 * 扩展包的设置页签用 #settings/<页签 id>，不需要内核知道页签是谁贡献的。
 *
 * hash 的推入、替换与退回和临时层（底部面板、工作台、图片预览）的返回键记录排在同一个历史队列里：
 * 打开设置时会先关掉临时层，它退掉自己那一笔要到下一个任务才落地，设置的 hash 要等它退完再推，
 * 否则刚推进去就被撤掉。
 */
const SETTINGS_PREFIX = '#settings/'

/** 早先的地址：个人资料、数据、外观已并进「通用」页 */
const LEGACY_SETTINGS_TABS: Record<string, string> = {
  profile: DIALOG_TABS.GENERAL,
  personal: DIALOG_TABS.GENERAL,
  data: DIALOG_TABS.GENERAL,
  appearance: DIALOG_TABS.GENERAL,
  service: DIALOG_TABS.SERVICE,
}

function isSettingsHash(hash: string) {
  return hash === '#settings' || hash.startsWith(SETTINGS_PREFIX)
}

function isLoginHash(hash: string) {
  return hash === '#login' || hash === '#register'
}

/** #settings 不指定页签；#settings/<页签 id> 指定页签（扩展包页签同样用自己的 id） */
function settingsTabFromHash(hash: string): string | undefined {
  if (!hash.startsWith(SETTINGS_PREFIX)) return undefined
  const tab = hash.slice(SETTINGS_PREFIX.length)
  return LEGACY_SETTINGS_TABS[tab] ?? tab
}

function hashFromSettingsTab(tab?: string): string {
  return tab ? `${SETTINGS_PREFIX}${tab}` : '#settings'
}

function overlayFor(hash: string) {
  return packOverlays().find(overlay => overlay.hash === hash)
}

function isOverlayHash(hash: string): boolean {
  return isSettingsHash(hash) || isLoginHash(hash) || Boolean(overlayFor(hash))
}

export function useOverlayHashState() {
  const route = useRoute()
  const router = useRouter()
  const authStore = useAuthStore()
  const globalStore = useGlobalStoreWithOut()

  let applyingRouteHash = false
  let syncingRouteHash = false
  let controllerPushedHash: string | null = null
  let pendingIdentityHash: { path: string; hash: string } | null = null
  let syncChain: Promise<void> = Promise.resolve()

  const currentOverlayHash = computed(() => {
    return isOverlayHash(route.hash) ? route.hash : ''
  })

  function closePackOverlays(except?: string) {
    for (const overlay of packOverlays()) {
      if (overlay.hash === except) continue
      overlay.close?.()
    }
  }

  function closeAllOverlayStores() {
    authStore.setLoginDialog(false)
    globalStore.updateSettingsDialog(false)
    closePackOverlays()
  }

  function closeOverlayStoresExcept(hash: string) {
    if (!isLoginHash(hash)) {
      authStore.setLoginDialog(false)
    }
    if (!isSettingsHash(hash)) globalStore.updateSettingsDialog(false)
    closePackOverlays(hash)
  }

  function openSettingsHash(hash: string) {
    authStore.setLoginDialog(false)
    closePackOverlays()
    globalStore.updateAccountSettingsView(undefined)
    globalStore.updateSettingsDialog(true, settingsTabFromHash(hash))
  }

  function applyHashToStores(rawHash: string) {
    applyingRouteHash = true
    const hash = rawHash
    pendingIdentityHash = null

    // 首次加载的默认身份是 visitor；等资料恢复后再让设置/扩展包执行自己的打开校验。
    if (
      (isSettingsHash(hash) || overlayFor(hash)) &&
      (!authStore.userInfoResolved || authStore.userInfoLoadFailed)
    ) {
      pendingIdentityHash = { path: route.path, hash }
      closeAllOverlayStores()
      void nextTick(() => {
        applyingRouteHash = false
      })
      return
    }

    if (!isOverlayHash(hash)) {
      closeAllOverlayStores()
      void nextTick(() => {
        applyingRouteHash = false
      })
      return
    }

    if (isSettingsHash(hash)) {
      openSettingsHash(hash)
    } else if (isLoginHash(hash)) {
      globalStore.updateSettingsDialog(false)
      closePackOverlays()
      authStore.setLoginDialog(true, hash === '#register' ? 'register' : 'login')
    } else {
      const overlay = overlayFor(hash)
      authStore.setLoginDialog(false)
      globalStore.updateSettingsDialog(false)
      closePackOverlays(hash)
      overlay?.open?.()
    }

    void nextTick(() => {
      applyingRouteHash = false
    })
  }

  function desiredHashFromStores(): string {
    if (authStore.loginDialog) {
      return authStore.authDialogMode === 'register' ? '#register' : '#login'
    }

    const openOverlay = packOverlays().find(overlay => overlay.isOpen?.())
    if (openOverlay) return openOverlay.hash

    return globalStore.settingsDialog ? hashFromSettingsTab(globalStore.settingsActiveTab) : ''
  }

  function replaceHash(hash: string) {
    return runInHistoryQueue(async () => {
      syncingRouteHash = true
      try {
        await router.replace({ path: route.path, query: route.query, hash })
      } finally {
        syncingRouteHash = false
      }
    })
  }

  function pushHash(hash: string) {
    return runInHistoryQueue(async () => {
      syncingRouteHash = true
      try {
        await router.push({ path: route.path, query: route.query, hash })
        controllerPushedHash = hash
      } finally {
        syncingRouteHash = false
      }
    })
  }

  async function clearOverlayHash() {
    if (!currentOverlayHash.value) return

    if (controllerPushedHash === currentOverlayHash.value) {
      await historyBack()
      return
    }

    controllerPushedHash = null
    await replaceHash('')
  }

  async function syncStoresToHash() {
    // 排在前面的历史操作（临时层退掉自己那一笔）落地后再比对，按那时的地址决定推、换还是退
    await whenHistorySettled()
    if (applyingRouteHash || syncingRouteHash) return

    const desiredHash = desiredHashFromStores()
    const currentHash = currentOverlayHash.value

    if (pendingIdentityHash) {
      // 尚未打开不等于用户关闭；但明确打开其他弹窗时，取消等待的旧目标。
      if (!desiredHash) return
      pendingIdentityHash = null
    }

    if (desiredHash) {
      applyingRouteHash = true
      closeOverlayStoresExcept(desiredHash)
      await nextTick()
      applyingRouteHash = false
    }

    if (desiredHash === currentHash) return

    if (!desiredHash) {
      await clearOverlayHash()
      return
    }

    if (!currentHash) {
      await pushHash(desiredHash)
      return
    }

    controllerPushedHash = controllerPushedHash ? desiredHash : null
    await replaceHash(desiredHash)
  }

  watch(
    () => authStore.userInfoResolved && !authStore.userInfoLoadFailed,
    ready => {
      if (!ready || !pendingIdentityHash) return
      const { path, hash } = pendingIdentityHash
      pendingIdentityHash = null
      if (route.path === path && route.hash === hash && !desiredHashFromStores()) {
        applyHashToStores(hash)
      }
    }
  )

  watch(
    () => route.hash,
    hash => {
      if (syncingRouteHash) return
      if (!isOverlayHash(hash)) controllerPushedHash = null
      applyHashToStores(hash)
    },
    { immediate: true }
  )

  // 换了页面、覆盖层的 hash 留着（当前会话在别处被删、换到别的会话时设置不关）：
  // 那一笔已经被替换成新页面的地址，关掉时不能再退，否则会退回原来的页面
  watch(
    () => route.path,
    () => {
      controllerPushedHash = null
      if (pendingIdentityHash?.path !== route.path) pendingIdentityHash = null
    }
  )

  watch(
    [
      () => authStore.loginDialog,
      () => authStore.authDialogMode,
      () => globalStore.settingsDialog,
      () => globalStore.settingsActiveTab,
      () => packOverlays().map(overlay => Boolean(overlay.isOpen?.())),
    ],
    () => {
      // 一次只同步一轮：上一轮的推入还没落地时，下一轮按落地后的地址比对，不会重复推
      syncChain = syncChain.then(syncStoresToHash).catch(() => undefined)
    },
    { flush: 'post', deep: true }
  )
}
