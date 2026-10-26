import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vitest/config'
import { tsconfigPathsToAlias } from './tsconfig-paths'

/**
 * Vitest 独立配置。
 *
 * 刻意不 mergeConfig 复用 vite.config.mts：该配置含 dev 中间件插件
 * （runtimeAssetPlugin，负责 pdfjs 静态资源转发与 closeBundle 拷贝）
 * 和面向生产的 build 定制，在测试管线里属于副作用。
 * 此处只保留 resolve.alias 等必要部分；alias 与 vite.config.mts 一样由
 * tsconfig.json 的 paths 派生（tsconfig-paths.ts），无需手工同步。
 */
export default defineConfig({
  plugins: [vue()],

  resolve: {
    alias: tsconfigPathsToAlias(),
  },

  test: {
    environment: 'happy-dom',
    environmentOptions: {
      happyDOM: {
        // 固定测试源，URL 协议 / 同源过滤断言不依赖运行环境默认值
        url: 'http://localhost:9002/',
      },
    },
    include: ['src/**/*.spec.ts'],
    // 不开 globals：测试文件显式 import { describe, it, expect } from 'vitest'，
    // 避免改动 tsconfig types 影响业务代码类型环境
    globals: false,
  },
})
