/** 商业包在站点公开配置里用到的键（服务端 commerce 配置段的 frontKeys） */
declare module '@/store/modules/auth/types' {
  interface GlobalConfig {
    signInStatus: string
    signInCredits: string
  }
}

export {}
