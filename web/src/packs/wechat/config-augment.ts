/** 微信包在站点公开配置里用到的键（服务端 wechat 配置段的 frontKeys） */
declare module '@/store/modules/auth/types' {
  interface GlobalConfig {
    wechatSilentLoginStatus: string
    weixinBotStatus: string
  }
}

export {}
