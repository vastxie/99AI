import { registerLoginMethodUi } from '@/auth/loginMethodUi'
import { definePack } from '@/core/packs/definePack'
import { t } from '@/locales'
import { useAuthStore } from '@/store/modules/auth'
import './config-augment'
import WechatIcon from './WechatIcon.vue'
import { WECHAT_OFFICIAL_PROVIDER, WECHAT_OPEN_WEB_PROVIDER } from './api/wechatOpenWeb'
import enUS from './locales/en-US.json'
import zhCN from './locales/zh-CN.json'
import manifest from './pack.json'

/**
 * 微信包（前端）：公众号扫码 / 微信内授权登录的品牌图标、微信开放平台内嵌扫码面板与回调页、
 * 微信内静默登录、微信 Bot 入口按钮 / 账号页绑定行与绑定视图。
 *
 * 由构建期环境变量 `VITE_WECHAT_ENABLED`控制，对应后端 WECHAT_PACK_ENABLED：
 * - 默认开启（变量缺省、为空或取其它任意值均视为开启）；
 * - 仅当取值（去空白、忽略大小写）为 `false` / `0` / `off` / `no` 之一时关闭。
 *
 * 关闭只隐藏 UI 入口与对应挂载点，登录方式列表仍以服务端为准。
 */
const WECHAT_DISABLED_VALUES = new Set(['false', '0', 'off', 'no'])

export function parseWechatEnabled(rawValue: unknown): boolean {
  if (rawValue === undefined || rawValue === null) return true
  const normalized = String(rawValue).trim().toLowerCase()
  if (!normalized) return true
  return !WECHAT_DISABLED_VALUES.has(normalized)
}

export function isWechatEnabled(): boolean {
  return parseWechatEnabled(import.meta.env.VITE_WECHAT_ENABLED)
}

const enabled = isWechatEnabled()

if (enabled) {
  registerLoginMethodUi({
    provider: WECHAT_OFFICIAL_PROVIDER,
    icon: WechatIcon,
    label: () => t('settings.wechat'),
  })
  registerLoginMethodUi({
    provider: WECHAT_OPEN_WEB_PROVIDER,
    icon: WechatIcon,
    label: () => t('settings.wechat'),
    panel: () => import('./WechatOpenWebLogin.vue'),
  })
}

/** 微信 Bot 通道在会话里的渠道名（与服务端一致） */
const WEIXIN_BOT_CHANNEL = 'weixin'

export default definePack({
  id: manifest.id,
  tier: 'feature',
  enabled,
  locales: { 'zh-CN': zhCN, 'en-US': enUS },
  routes: [
    {
      path: `/auth/callback/${WECHAT_OPEN_WEB_PROVIDER}`,
      name: 'WechatOpenWebCallback',
      component: () => import('./WechatOpenWebCallback.vue'),
    },
  ],
  slots: {
    'account.security': [
      {
        id: 'wechat.bot-entry',
        key: 'weixinBot',
        component: () => import('./WeixinBotAccountEntry.vue'),
      },
    ],
    'account.view': [
      {
        id: 'wechat.bot-panel',
        key: 'weixinBot',
        component: () => import('./WeixinBotBindPanel.vue'),
      },
    ],
    'sider.rail': [
      {
        id: 'wechat.bot-rail',
        component: () => import('./WeixinBotButton.vue'),
        props: { compact: true, hideWhenUnbound: true },
      },
    ],
    'sider.list': [{ id: 'wechat.bot-list', component: () => import('./WeixinBotButton.vue') }],
  },
  hooks: {
    /** 站点开启微信内授权时，微信浏览器里完成静默登录（OAuth 回调页除外） */
    async onAppReady({ isOAuthCallbackRoute }) {
      if (isOAuthCallbackRoute) return
      const silentLoginEnabled = Number(useAuthStore().globalConfig?.wechatSilentLoginStatus) === 1
      if (!silentLoginEnabled) return
      const { isWechatBrowser, runWechatSilentLogin } = await import('./silentLogin')
      if (!isWechatBrowser()) return
      await runWechatSilentLogin()
    },
    channelLabel: channel =>
      channel === WEIXIN_BOT_CHANNEL ? t('settings.weixinConversation') : undefined,
  },
})
