import { describe, expect, it, vi } from 'vitest'

const registry = vi.hoisted(() => ({
  languages: vi.fn(() => [['pack-lang', () => ({ name: 'pack-lang', contains: [] })]]),
}))
vi.mock('@/packs', () => ({ packHighlightLanguages: registry.languages }))

describe('共享 highlight.js 实例（按需加载）', () => {
  it('加载模块时不读包注册表、不加载高亮库；第一次需要时才加载，并注册包声明的语言，只注册一次', async () => {
    const { currentHighlighter, highlighterReady, loadHighlighter } = await import('./highlight')
    expect(registry.languages).not.toHaveBeenCalled()
    expect(highlighterReady()).toBe(false)

    // 还没加载：先返回 null（调用方显示纯文本），同时触发加载
    expect(currentHighlighter()).toBeNull()
    const hljs = await loadHighlighter()
    expect(highlighterReady()).toBe(true)
    expect(hljs.getLanguage('pack-lang')).toBeTruthy()
    expect(currentHighlighter()).toBe(hljs)
    expect(await loadHighlighter()).toBe(hljs)
    expect(registry.languages).toHaveBeenCalledTimes(1)
  })
})
