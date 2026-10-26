import { mount } from '@vue/test-utils'
import { afterEach, describe, expect, it } from 'vitest'
import { defineComponent, h, nextTick, ref } from 'vue'
import { useMessageEntrance } from './useMessageEntrance'

type Item = { cid: string; role: 'user' | 'assistant' }

/**
 * 在真实组件里跑 composable，模板绑定与 chatBase 一致：
 * 用户消息按 isEntering 挂 chat-message-enter，外层的 animationend 交给 handleAnimationEnd。
 */
function mountTranscript(initial: Item[] = []) {
  const messages = ref<Item[]>(initial)
  let api!: ReturnType<typeof useMessageEntrance>
  const wrapper = mount(
    defineComponent({
      setup() {
        api = useMessageEntrance({
          hasMessage: cid => messages.value.some(item => item.cid === cid),
        })
        return () =>
          h(
            'div',
            messages.value.map(item =>
              h(
                'div',
                {
                  'data-cid': item.cid,
                  class: { 'chat-message-enter': item.role === 'user' && api.isEntering(item.cid) },
                  onAnimationend: (event: AnimationEvent) =>
                    api.handleAnimationEnd(event, item.cid),
                },
                [h('span', { class: 'bubble-child' })]
              )
            )
          )
      },
    }),
    { attachTo: document.body }
  )
  const row = (cid: string) => wrapper.get(`[data-cid="${cid}"]`)
  return { wrapper, api, messages, row }
}

const animationEnd = () =>
  new AnimationEvent('animationend', { bubbles: true, animationName: 'chat-message-appear' })

afterEach(() => {
  document.body.innerHTML = ''
})

describe('useMessageEntrance 用户消息入场标记', () => {
  it('新发送确认时先标记再插入列表：只有该条用户消息带入场类，助手回复不带', async () => {
    const { wrapper, api, messages, row } = mountTranscript()
    expect(api.mark('u1')).toBe(true)
    messages.value.push({ cid: 'u1', role: 'user' }, { cid: 'a1', role: 'assistant' })
    await nextTick()
    expect(row('u1').classes()).toContain('chat-message-enter')
    expect(row('a1').classes()).not.toContain('chat-message-enter')
    expect(api.isEntering('a1')).toBe(false)
    expect(api.isEntering(undefined)).toBe(false)
    wrapper.unmount()
  })

  it('历史加载与重连恢复带回的消息（列表里已有该 cid）不标记，空 cid 也不标记', async () => {
    const { wrapper, api, row } = mountTranscript([{ cid: 'h1', role: 'user' }])
    expect(api.mark('h1')).toBe(false)
    expect(api.mark(undefined)).toBe(false)
    expect(api.mark('')).toBe(false)
    await nextTick()
    expect(api.isEntering('h1')).toBe(false)
    expect(row('h1').classes()).not.toContain('chat-message-enter')
    wrapper.unmount()
  })

  it('气泡内子元素冒泡上来的 animationend 不移除标记', async () => {
    const { wrapper, api, messages, row } = mountTranscript()
    api.mark('u1')
    messages.value.push({ cid: 'u1', role: 'user' })
    await nextTick()
    row('u1').get('.bubble-child').element.dispatchEvent(animationEnd())
    await nextTick()
    expect(api.isEntering('u1')).toBe(true)
    expect(row('u1').classes()).toContain('chat-message-enter')
    wrapper.unmount()
  })

  it('元素自身的 animationend 只移除该条消息的标记，其它入场中的消息不受影响', async () => {
    const { wrapper, api, messages, row } = mountTranscript()
    api.mark('u1')
    api.mark('u2')
    messages.value.push({ cid: 'u1', role: 'user' }, { cid: 'u2', role: 'user' })
    await nextTick()
    row('u1').element.dispatchEvent(animationEnd())
    await nextTick()
    expect(row('u1').classes()).not.toContain('chat-message-enter')
    expect(row('u2').classes()).toContain('chat-message-enter')
    expect(api.isEntering('u1')).toBe(false)
    expect(api.isEntering('u2')).toBe(true)
    wrapper.unmount()
  })

  it('clear 清空全部标记（切换会话），DOM 同步摘掉入场类', async () => {
    const { wrapper, api, messages } = mountTranscript()
    api.mark('u1')
    api.mark('u2')
    messages.value.push({ cid: 'u1', role: 'user' }, { cid: 'u2', role: 'user' })
    await nextTick()
    api.clear()
    await nextTick()
    expect(api.isEntering('u1')).toBe(false)
    expect(api.isEntering('u2')).toBe(false)
    expect(wrapper.findAll('.chat-message-enter')).toHaveLength(0)
    expect(wrapper.findAll('[data-cid]')).toHaveLength(2)
    wrapper.unmount()
  })
})
