import type { LanguageFn } from 'highlight.js'
import type { Component } from 'vue'
import type { RouteRecordRaw } from 'vue-router'

/**
 * 前端扩展包契约：包用 definePack 描述自己向内核挂载点、覆盖层与钩子的贡献。
 * 本文件不引用注册表，包可以安全地 import 它而不产生循环依赖；注册表见 @/packs。
 */
export type PackTier = 'system' | 'feature'
export type PackComponentLoader = () => Promise<{ default: Component }>

/** 内核预留的挂载点 */
export type PackSlotName =
  /** 设置弹窗的页签（桌面 / 移动端共用）；key 为页签 id */
  | 'settings.tab'
  /** 移动端设置首页用户名下方的标签 */
  | 'settings.mobile.badge'
  /** 账号页资料卡片下方的附加卡片 */
  | 'account.card'
  /** 账号页「账户安全」列表里的行；key 为该行打开的子视图 id */
  | 'account.security'
  /** 账号页的子视图；key 与 account.security 的 key 对应 */
  | 'account.view'
  /** 折叠侧栏的图标按钮 */
  | 'sider.rail'
  /** 展开侧栏会话列表上方 */
  | 'sider.list'
  /** 侧栏用户名下方的一行 */
  | 'sider.user'
  /** 移动端头像菜单项 */
  | 'header.menu'
  /** 与登录 / 设置同层的全局弹窗 */
  | 'chat.dialog'
  /** 消息里的特殊内容渲染器；key 为消息 model */
  | 'message.renderer'
  /** 预览面板渲染器；key 为内容类型 */
  | 'preview.renderer'
  /** 右侧面板；key 为面板类型 */
  | 'side.panel'

export interface PackSlotContribution {
  /** 全局唯一，建议 `<包 id>.<名字>` */
  id: string
  /** 按 key 查找的挂载点必填 */
  key?: string
  order?: number
  component: PackComponentLoader
  /** 页签 / 菜单项文案（在渲染时调用，便于跟随语言切换） */
  label?: () => string
  /** 紧凑导航文案；页面标题仍使用 label。 */
  navigationLabel?: () => string
  icon?: Component
  props?: Record<string, unknown>
  /**
   * 只在返回 true 时渲染（在渲染时调用，可以读 store）：例如弹窗第一次打开之前不挂载，
   * 进入页面时不加载它的代码。不给就总是渲染
   */
  when?: () => boolean
}

/** 由包接管的覆盖层 hash（如签到弹窗），内核负责 hash 与 store 的双向同步 */
export interface PackOverlay {
  hash: string
  open?: () => void
  close?: () => void
  isOpen?: () => boolean
}

export interface PackChatError {
  kind: string
  message: string
  raw: unknown
}

export interface PackHooks {
  /** 应用挂载前（store 就绪、全局配置已拉取、访客会话已建立） */
  onAppReady?: (context: { isOAuthCallbackRoute: boolean }) => void | Promise<void>
  /** 把后端错误归类为本包认识的错误种类；返回 undefined 表示不认识 */
  classifyChatError?: (error: unknown) => string | undefined
  /** 处理对话错误；返回 true 表示已处理，内核不再提示 */
  onChatError?: (
    error: PackChatError,
    context: { isMobile: boolean; isAuthenticated: boolean }
  ) => boolean
  /** 会话来源渠道的显示名 */
  channelLabel?: (channel: string) => string | undefined
}

export interface ChatPackDefinition {
  id: string
  tier: PackTier
  enabled: boolean
  routes?: RouteRecordRaw[]
  /** 语言包片段，按 locale 合并进内核 i18n */
  locales?: Record<string, Record<string, unknown>>
  slots?: Partial<Record<PackSlotName, PackSlotContribution[]>>
  overlays?: PackOverlay[]
  hooks?: PackHooks
  /**
   * 代码块高亮需要的额外语言（名称 → highlight.js 语言定义）。只声明不注册：
   * 由内核的高亮模块在第一次取用高亮实例时统一注册，包入口不引入 highlight.js，挂载前的关键路径不背它
   */
  highlightLanguages?: Record<string, LanguageFn>
}

export function definePack(definition: ChatPackDefinition): ChatPackDefinition {
  return definition
}
