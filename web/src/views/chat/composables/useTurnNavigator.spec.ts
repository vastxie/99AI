import { mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { computed, defineComponent, ref } from 'vue'
import { useTurnNavigator } from './useTurnNavigator'

function makeMessage(partial: { role: string; cid?: string; text?: string }): Chat.Chat {
  return {
    content: partial.text || '',
    error: false,
    ...partial,
  } as unknown as Chat.Chat
}

/** 在真实组件 setup 中运行 composable，保证 watch 生命周期与作用域回收生效 */
function mountTurnNavigator(messages: Chat.Chat[]) {
  let exposed!: ReturnType<typeof useTurnNavigator>
  const chatMessages = ref(messages)
  const wrapper = mount(
    defineComponent({
      setup() {
        exposed = useTurnNavigator({
          scrollRef: ref(null),
          chatMessages: computed(() => chatMessages.value),
          isMobile: ref(false),
          getItemText: item => item.content || '',
        })
        return () => null
      },
    })
  )
  return { wrapper, exposed, chatMessages }
}

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('useTurnNavigator 轮次条目计算', () => {
  it('仅收录带 cid 的用户消息并按轮次编号（正例）', () => {
    const { wrapper, exposed } = mountTurnNavigator([
      makeMessage({ role: 'user', cid: 'c1', text: '第一问' }),
      makeMessage({ role: 'assistant', cid: 'a1', text: '回答' }),
      makeMessage({ role: 'user', cid: 'c2', text: '第二问' }),
    ])

    expect(exposed.turnNavigatorItems.value).toEqual([
      { cid: 'c1', text: '第一问', response: '', messageIndex: 0, turnIndex: 0 },
      { cid: 'c2', text: '第二问', response: '', messageIndex: 2, turnIndex: 1 },
    ])
    expect(exposed.turnNavigatorRailItems.value.map(item => item.railSlot)).toEqual([0, 1])

    wrapper.unmount()
  })

  it('无 cid 的用户消息与助手消息不进入轨道（反例）', () => {
    const { wrapper, exposed } = mountTurnNavigator([
      makeMessage({ role: 'user', text: '无 cid' }),
      makeMessage({ role: 'assistant', cid: 'a1' }),
    ])

    expect(exposed.turnNavigatorItems.value).toEqual([])

    wrapper.unmount()
  })

  it('活跃轮次默认回落到最后一个用户轮次（正例）', () => {
    const { wrapper, exposed } = mountTurnNavigator([
      makeMessage({ role: 'user', cid: 'c1' }),
      makeMessage({ role: 'user', cid: 'c2' }),
    ])

    expect(exposed.activeTurnNavigatorCid.value).toBe('c2')

    exposed.selectedTurnNavigatorCid.value = 'c1'
    expect(exposed.activeTurnNavigatorCid.value).toBe('c1')

    wrapper.unmount()
  })
})

describe('useTurnNavigator 悬停展开状态机', () => {
  it('悬停 300ms 后展开，离开 120ms 后收起（正例）', () => {
    const { wrapper, exposed } = mountTurnNavigator([makeMessage({ role: 'user', cid: 'c1' })])

    exposed.handleTurnNavigatorMouseEnter()
    expect(exposed.turnNavigatorExpanded.value).toBe(false)

    vi.advanceTimersByTime(300)
    expect(exposed.turnNavigatorExpanded.value).toBe(true)

    exposed.handleTurnNavigatorMouseLeave()
    vi.advanceTimersByTime(120)
    expect(exposed.turnNavigatorExpanded.value).toBe(false)

    wrapper.unmount()
  })

  it('展开等待期内离开则不展开（反例：短暂掠过不抖动）', () => {
    const { wrapper, exposed } = mountTurnNavigator([makeMessage({ role: 'user', cid: 'c1' })])

    exposed.handleTurnNavigatorMouseEnter()
    vi.advanceTimersByTime(100)
    exposed.handleTurnNavigatorMouseLeave()
    vi.advanceTimersByTime(1000)

    expect(exposed.turnNavigatorExpanded.value).toBe(false)

    wrapper.unmount()
  })

  it('交互复位与卸载清理不抛错且状态归位（边界）', () => {
    const { wrapper, exposed } = mountTurnNavigator([makeMessage({ role: 'user', cid: 'c1' })])

    exposed.handleTurnNavigatorMouseEnter()
    exposed.resetTurnNavigatorInteraction()
    expect(exposed.turnNavigatorExpanded.value).toBe(false)
    expect(exposed.turnNavigatorJumpTargetCid.value).toBeNull()

    expect(() => exposed.disposeTurnNavigator()).not.toThrow()
    vi.advanceTimersByTime(1000)
    expect(exposed.turnNavigatorExpanded.value).toBe(false)

    wrapper.unmount()
  })
})
