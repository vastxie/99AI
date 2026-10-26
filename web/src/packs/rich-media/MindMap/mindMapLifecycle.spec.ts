import { mount } from '@vue/test-utils'
import { createPinia } from 'pinia'
import { describe, expect, it, vi } from 'vitest'
import i18n from '@/locales'

const markmap = vi.hoisted(() => ({
  setData: vi.fn(),
  fit: vi.fn(),
  destroy: vi.fn(),
}))

vi.mock('markmap-view', () => ({ Markmap: { create: vi.fn(() => markmap) } }))

import MindMap from './index.vue'

describe('思维导图消息的生命周期', () => {
  it('卸载时销毁 Markmap 实例（释放它登记的观察器与钩子），排队中的渲染不再执行', async () => {
    vi.useFakeTimers()
    try {
      const wrapper = mount(MindMap, {
        props: { content: '# 标题\n- 分支', loading: false } as any,
        global: { plugins: [createPinia(), i18n] },
      })
      wrapper.unmount()
      expect(markmap.destroy).toHaveBeenCalledTimes(1)
      vi.runAllTimers()
      expect(markmap.setData).not.toHaveBeenCalled()
    } finally {
      vi.useRealTimers()
    }
  })
})
