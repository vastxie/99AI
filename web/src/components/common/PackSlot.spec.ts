import { flushPromises, mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import { defineComponent, h, ref } from 'vue'

const state = vi.hoisted(() => ({ opened: null as null | { value: boolean } }))
const Dialog = defineComponent({
  name: 'LazyDialog',
  render: () => h('div', { class: 'lazy-dialog' }),
})
const loader = vi.fn(async () => Dialog)

vi.mock('@/packs', () => ({
  slot: () => [
    {
      id: 'test.always',
      component: async () => defineComponent({ render: () => h('span', 'always') }),
    },
    { id: 'test.dialog', component: loader, when: () => state.opened!.value },
  ],
}))

import PackSlot from './PackSlot.vue'

describe('扩展包挂载点', () => {
  it('带 when 的贡献在条件成立之前不渲染，也不加载它的代码', async () => {
    state.opened = ref(false)
    const wrapper = mount(PackSlot, { props: { name: 'chat.dialog' as any } })
    await flushPromises()
    expect(wrapper.text()).toContain('always')
    expect(wrapper.find('.lazy-dialog').exists()).toBe(false)
    expect(loader).not.toHaveBeenCalled()

    state.opened.value = true
    await flushPromises()
    expect(loader).toHaveBeenCalledTimes(1)
    expect(wrapper.find('.lazy-dialog').exists()).toBe(true)
    wrapper.unmount()
  })
})
