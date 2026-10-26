import { mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import i18n from '@/locales'
import { readStyle } from '@/styles/stylesheet.testkit'
import { TOOLTIP_HIDDEN_MEDIA } from '../tooltip'
import ActionIcon from './index.vue'

const media = vi.hoisted(() => ({ hidden: { value: false } }))

vi.mock('../tooltip', async importOriginal => {
  const { ref } = await import('vue')
  const actual = await importOriginal<typeof import('../tooltip')>()
  const hidden = ref(false)
  media.hidden = hidden
  return { ...actual, useTooltipHidden: () => hidden }
})

afterEach(() => {
  media.hidden.value = false
})

describe('图标按钮的原生 title', () => {
  it('自绘提示会显示时不给原生 title（悬停不冒出两个提示）；样式层把它关掉的环境（触屏、窄窗口）照样给', async () => {
    const icon = mount(ActionIcon, {
      props: { label: '复制', tooltip: '复制这段' },
      global: { plugins: [i18n] },
    })
    expect(icon.get('button').attributes('title')).toBeUndefined()

    media.hidden.value = true
    await nextTick()
    expect(icon.get('button').attributes('title')).toBe('复制这段')
  })

  it('判断用的媒体查询与样式层隐藏自绘提示的是同一条', () => {
    const css = readStyle('src/styles/recipes.css')
    const start = css.indexOf(`@media ${TOOLTIP_HIDDEN_MEDIA} {`)
    expect(start).toBeGreaterThanOrEqual(0)
    expect(css.slice(start)).toMatch(/^@media[^{]+\{\s*\.tooltip\s*\{\s*display:\s*none/)
  })

  it('没有自绘提示时照常给 title', () => {
    const icon = mount(ActionIcon, {
      props: { label: '更多', title: '更多操作' },
      global: { plugins: [i18n] },
    })
    expect(icon.get('button').attributes('title')).toBe('更多操作')
  })
})
