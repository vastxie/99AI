/// <reference types="vite/client" />

/** 应用代码里读取的构建期变量（vite.config.mts 另经 loadEnv 读取 VITE_BASE_PATH 与开发代理地址） */
interface ImportMetaEnv {
  readonly VITE_GLOB_API_URL: string
  /** 扩展包开关（只有取值为 false 时关闭，写法见各包 index.ts）：src/packs/<包名> */
  readonly VITE_COMMERCE_ENABLED?: string
  readonly VITE_WECHAT_ENABLED?: string
  readonly VITE_GITHUB_ENABLED?: string
  readonly VITE_RICH_MEDIA_ENABLED?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
