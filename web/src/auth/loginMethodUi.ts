import type { Component } from 'vue'

/**
 * 登录方式的前端表现（内核注册表）：各渠道包在自己的入口文件里登记图标 / 自定义面板，
 * 登录框与账号页按 /auth/providers 返回的 provider 查表渲染；没登记的方式用通用样式。
 */
export interface LoginMethodUi {
  provider: string
  /** 品牌图标（按钮 / 账号页行内） */
  icon?: Component
  /** 自定义登录面板（如某渠道的内嵌扫码），优先于通用二维码面板 */
  panel?: () => Promise<{ default: Component }>
  /** 账号页 / 登录框里的显示名（渲染时调用，跟随语言切换）；未登记时用服务端展示名 */
  label?: () => string
}

const registry = new Map<string, LoginMethodUi>()

export function registerLoginMethodUi(ui: LoginMethodUi) {
  registry.set(ui.provider, ui)
}

export function getLoginMethodUi(provider: string): LoginMethodUi | undefined {
  return registry.get(provider)
}
