<script setup lang="ts">
import favicon from '@/assets/favicon.ico'

import Watermark from '@/components/common/Watermark/index.vue'
import HtmlDialog from '@/components/HtmlDialog.vue'
import { initWechatLogin } from '@/services/wechatLogin' // 导入微信登录相关功能
import { useAuthStore, useGlobalStoreWithOut } from '@/store'
import { DIALOG_TABS } from '@/store/modules/global'
import { ClientJS } from 'clientjs'
import { computed, onMounted, ref } from 'vue'
import { ss } from './utils/storage'

const client = new ClientJS()
const authStore = useAuthStore()
const useGlobalStore = useGlobalStoreWithOut()
const sharedHtml = ref('')

// 获取客户端指纹
useGlobalStore.updateFingerprint(client.getFingerprint())

// 获取配置
const faviconPath = computed(() => authStore.globalConfig?.clientFaviconPath || favicon)
const isAutoOpenNotice = computed(() => Number(authStore.globalConfig?.isAutoOpenNotice) === 1)
const isLogin = computed(() => authStore.isLogin)
const wechatSilentLoginStatus = computed(
  () => Number(authStore.globalConfig?.wechatSilentLoginStatus) === 1
)
const showWatermark = computed(() => Number(authStore.globalConfig?.showWatermark) === 1)
// 默认不清除缓存，需要在后台配置中设置为1才开启自动清除
const clearCacheEnabled = computed(() => Number(authStore.globalConfig?.clearCacheEnabled) === 1)

/**
 * 清除所有本地缓存
 * 包括localStorage、sessionStorage和indexedDB缓存
 * @param {boolean} forceClear 强制清除缓存，不考虑配置
 */
function clearAllCache(forceClear = false) {
  // 如果未启用清除缓存且未指定强制清除，则跳过
  if (!clearCacheEnabled.value && !forceClear) {
    console.log('缓存清除未启用')
    return
  }

  // 获取当前登录状态
  const isUserLoggedIn = authStore.isLogin
  // 如果用户已登录，则不清除缓存
  if (isUserLoggedIn) {
    console.log('用户已登录，跳过缓存清除')
    return
  }

  // 以下是用户未登录时的缓存清除逻辑
  // 保存所有本地存储的关键数据
  const savedData: Record<string, string | null> = {}

  // 保存主题
  savedData['theme'] = localStorage.getItem('theme') || 'light'

  // 保存其他非登录相关但需要保留的数据
  const preserveKeys = ['appLanguage', 'agreedToUserAgreement']

  // 保存这些数据
  preserveKeys.forEach(key => {
    const value = localStorage.getItem(key)
    if (value) savedData[key] = value

    const ssValue = sessionStorage.getItem(key)
    if (ssValue) savedData[`ss_${key}`] = ssValue
  })

  // 清除localStorage
  localStorage.clear()

  // 清除sessionStorage
  sessionStorage.clear()

  // 恢复所有保存的数据
  Object.keys(savedData).forEach(key => {
    const value = savedData[key]
    if (value !== null) {
      if (key.startsWith('ss_')) {
        // 恢复到sessionStorage
        sessionStorage.setItem(key.substring(3), value)
      } else {
        // 恢复到localStorage
        localStorage.setItem(key, value)
      }
    }
  })

  // 清除indexedDB数据库
  if (window.indexedDB.databases) {
    window.indexedDB
      .databases()
      .then(databases => {
        databases.forEach(database => {
          if (database.name) {
            window.indexedDB.deleteDatabase(database.name)
          }
        })
      })
      .catch(() => {
        // 如果浏览器不支持databases()方法，使用兼容性方式处理
        console.warn('无法直接清除IndexedDB数据库')
      })
  }

  // 清除应用缓存(如果支持)
  if ('caches' in window) {
    caches.keys().then(keys => {
      keys.forEach(key => {
        caches.delete(key)
      })
    })
  }

  console.log('本地缓存已清除')
}

async function loadBaiduCode() {
  const baiduCode = authStore.globalConfig?.baiduCode
  if (!baiduCode) return
  const scriptElem = document.createElement('script')
  scriptElem.innerHTML = baiduCode.replace(/<script[\s\S]*?>([\s\S]*?)<\/script>/gi, '$1')
  document.head.appendChild(scriptElem)
}

function setDocumentTitle() {
  document.title = authStore.globalConfig?.siteName || 'AI'
}

function noticeInit() {
  const showNotice = ss.get('showNotice')
  if ((!showNotice || Date.now() > Number(showNotice)) && isAutoOpenNotice.value) {
    useGlobalStore.updateSettingsDialog(true, DIALOG_TABS.NOTICE)
  }
}

/**
 * 检测当前浏览器是否是微信内置浏览器
 * 区分微信和企业微信，只有微信浏览器返回true
 * @returns {boolean} 如果是微信浏览器返回 true，否则返回 false
 */
function isWechatBrowser(): boolean {
  const ua = navigator.userAgent.toLowerCase()

  // 检查是否是企业微信
  const isWXWork = ua.indexOf('wxwork') !== -1

  // 检查是否是微信，排除企业微信的情况
  const isWeixin = !isWXWork && ua.indexOf('micromessenger') !== -1

  return isWeixin
}

onMounted(async () => {
  // 设置网站标题
  setDocumentTitle()

  // 加载百度统计代码（如果有）
  loadBaiduCode()

  // 如果开启微信静默登录，并且是微信浏览器，执行微信登录逻辑
  if (wechatSilentLoginStatus.value && isWechatBrowser()) {
    await initWechatLogin() // 初始化微信登录
  }

  // 尝试自动清除缓存
  clearAllCache()

  /* 动态设置网站ico svg格式 */
  const link = document.createElement('link')
  link.rel = 'shortcut icon'
  link.href = faviconPath.value
  link.type = 'image/png' // 设置正确的图像类型

  // 移除已存在的favicon链接，防止冲突
  const existingFavicons = document.querySelectorAll('link[rel="shortcut icon"], link[rel="icon"]')
  existingFavicons.forEach(node => node.parentNode?.removeChild(node))

  // 添加新的favicon链接
  document.head.appendChild(link)
  // 初始化通知提示
  await noticeInit()
})
</script>

<template>
  <!-- 水印组件（如果启用） -->
  <Watermark v-if="showWatermark"></Watermark>

  <!-- 主要内容使用router-view -->
  <router-view />

  <!-- 共享内容对话框 -->
  <HtmlDialog :visible="useGlobalStore.htmlDialog" :html="sharedHtml" />

  <!-- 全局图片预览器 -->
  <GlobalImageViewer />
</template>
