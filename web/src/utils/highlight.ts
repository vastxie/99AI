/**
 * 统一的 highlight.js 实例（lib/common 子集，约 36 种常用语言），按需加载。
 *
 * 首屏不带它（约 160 KB）：第一次需要高亮时才加载，加载完成前代码按转义后的纯文本显示，
 * 读过 currentHighlighter() 的计算在加载完成时自动重跑。
 * 未注册的冷门语言会降级：`getLanguage()` 返回 undefined 时调用方走纯文本；
 * `highlightAuto` 只在已注册语言里识别，均不会报错。
 */
import type { HLJSApi } from 'highlight.js'
import { shallowRef } from 'vue'
import { packHighlightLanguages } from '@/packs'

const loaded = shallowRef<HLJSApi | null>(null)
let loading: Promise<HLJSApi> | null = null

/** 加载高亮库；扩展包声明的额外语言（如图表语法）在这时统一注册 */
export function loadHighlighter(): Promise<HLJSApi> {
  if (!loading) {
    const pending = import('highlight.js/lib/common').then(module => {
      const hljs = module.default
      for (const [name, language] of packHighlightLanguages()) hljs.registerLanguage(name, language)
      loaded.value = hljs
      return hljs
    })
    // 加载失败（断网）时允许下一次需要高亮时再试
    pending.catch(() => {
      if (loading === pending) loading = null
    })
    loading = pending
  }
  return loading
}

/** 当前可用的高亮实例；还没加载时触发加载并返回 null（调用方先显示纯文本） */
export function currentHighlighter(): HLJSApi | null {
  const hljs = loaded.value
  if (!hljs) void loadHighlighter().catch(() => undefined)
  return hljs
}

/** 高亮库是否已经可用（只读、不触发加载）：加载完成时需要重新高亮的地方 watch 它 */
export function highlighterReady(): boolean {
  return loaded.value !== null
}

/** 转义成可以直接放进 <code> 的纯文本 */
export function escapeCodeHtml(value: string) {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
}
