import { shallowRef } from 'vue'
import type { MathRenderer } from './markdownItMath'

/*
 * KaTeX 按需加载：大多数对话没有公式，不让它（约 260 KB）和样式挤进首屏。
 * 第一次遇到公式时才加载（ESM 版本，与图表扩展包按需引入的是同一份）；加载完成前公式显示为 TeX 源码，
 * 读过 currentKatex() 的渲染函数在加载完成时自动重跑
 */
const loaded = shallowRef<MathRenderer | null>(null)
let loading: Promise<MathRenderer> | null = null

export function loadKatex(): Promise<MathRenderer> {
  if (!loading) {
    const pending = Promise.all([import('katex'), import('katex/dist/katex.min.css')]).then(
      ([module]) => {
        loaded.value = module.default
        return module.default
      }
    )
    // 加载失败（断网）时允许下一次遇到公式再试
    pending.catch(() => {
      if (loading === pending) loading = null
    })
    loading = pending
  }
  return loading
}

/** 当前可用的 KaTeX；还没加载时触发加载并返回 null */
export function currentKatex(): MathRenderer | null {
  const katex = loaded.value
  if (!katex) void loadKatex().catch(() => undefined)
  return katex
}

/** KaTeX 是否已经可用：渲染缓存以它为依赖之一，加载完成时重新渲染含公式的内容 */
export function katexState(): MathRenderer | null {
  return loaded.value
}
