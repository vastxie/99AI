import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { describe, expect, it, vi } from 'vitest'
import i18n from '@/locales'
import type { Round } from '@/types/chat'
import { ChatLogStatus } from '@/constants/chatLogStatus'
import AssistantMessage from './AssistantMessage.vue'
import { useGlobalStore } from '@/store/modules/global'
import { chatActionsProvide } from '@/views/chat/chatActions.testkit'

vi.mock('./highlightThemeStyles.helpers', () => ({ injectThemeStyles: vi.fn() }))

const messageFor = (rounds: Partial<Round>[]) => JSON.stringify({ role: 'assistant', rounds })
function mountRunningMessage(rounds: Partial<Round>[] = []) {
  const pinia = createPinia()
  setActivePinia(pinia)
  return mount(AssistantMessage, {
    props: {
      index: 0,
      cid: 'activity-test',
      loading: true,
      isLast: true,
      message: messageFor(rounds),
    },
    global: {
      plugins: [pinia, i18n],
      provide: chatActionsProvide(),
      stubs: {
        MarkdownVNodeRenderer: { props: ['source'], template: '<p>{{ source }}</p>' },
        MediaOutput: true,
      },
    },
  })
}

describe('助手活动呈现状态切换', () => {
  it('活动行不带过渡类；计时更新与真实思考接续都复用同一节点', async () => {
    vi.useFakeTimers()
    const wrapper = mountRunningMessage([])
    try {
      const initial = wrapper.get('.message-status-slot')
      expect(initial.classes()).not.toContain('text-rise-enter')
      expect(initial.text()).toBe('正在思考')
      await wrapper.setProps({
        startedAt: new Date().toISOString(),
        message: messageFor([{ thinking: '分析任务', text: '', toolCalls: [] }]),
      })
      await vi.advanceTimersByTimeAsync(2000)
      expect(wrapper.get('.message-status-slot').element).toBe(initial.element)
      expect(initial.get('.tabular-nums').text()).toContain('2 秒')
    } finally {
      wrapper.unmount()
      vi.useRealTimers()
    }
  })

  it('思考与工具交叉切换时始终只有一行状态，节点不重建也不残留 inert', async () => {
    const wrapper = mountRunningMessage([])
    const tool = { id: 'tool-1', name: 'bash', input: {}, status: 'loading' as const }
    try {
      const status = wrapper.get('.message-status-slot').element
      await wrapper.setProps({ message: messageFor([{ toolCalls: [tool] }]) })
      expect(wrapper.findAll('.message-status-slot')).toHaveLength(1)
      expect(wrapper.get('.message-status-slot').element).toBe(status)
      await wrapper.setProps({
        message: messageFor([{ toolCalls: [{ ...tool, id: 'tool-2' }] }]),
      })
      expect(wrapper.get('.message-status-slot').element).toBe(status)
      await wrapper.setProps({
        message: messageFor([{ thinking: '核对结果', text: '', toolCalls: [] }]),
      })
      expect(wrapper.findAll('.message-status-slot')).toHaveLength(1)
      expect(wrapper.get('.message-status-slot').element).toBe(status)
      expect(wrapper.get('.message-status-slot').text()).toContain('正在思考')
      expect(wrapper.get('.message-status-slot').attributes('inert')).toBeUndefined()
    } finally {
      wrapper.unmount()
    }
  })

  it('运行中操作栏隐藏且惰性，结束后直接显示；活动行原地变为总汇总', async () => {
    const wrapper = mountRunningMessage([{ thinking: '分析任务', text: '', toolCalls: [] }])
    try {
      const controls = wrapper.get('.assistant-controls-slot')
      expect(controls.classes()).not.toContain('text-rise-enter')
      expect((controls.element as HTMLElement).style.display).toBe('none')
      expect(controls.attributes('inert')).toBe('')
      expect(controls.attributes('aria-hidden')).toBe('true')
      const status = wrapper.get('.message-status-slot').element

      await wrapper.setProps({ loading: false })
      expect((controls.element as HTMLElement).style.display).not.toBe('none')
      expect(controls.attributes('inert')).toBeUndefined()
      expect(controls.attributes('aria-hidden')).not.toBe('true')
      expect(wrapper.find('.message-status-slot').exists()).toBe(false)
      expect(wrapper.get('.assistant-final-activity-row').element).toBe(status)
      expect(wrapper.get('.assistant-final-activity-row').text()).toContain('已思考')

      await wrapper.setProps({ loading: true })
      expect(controls.attributes('inert')).toBe('')
      expect(wrapper.get('.message-status-slot').element).toBe(status)
    } finally {
      wrapper.unmount()
    }
  })

  it('思考 → 正文 → 结束全程同一节点：正文期改为静态汇总，结束后原地变为总汇总', async () => {
    const wrapper = mountRunningMessage([{ thinking: '分析任务', text: '', toolCalls: [] }])
    try {
      const row = wrapper.get('.message-status-slot').element
      await wrapper.setProps({ content: '第一段正文' })
      expect(wrapper.find('.message-status-slot').exists()).toBe(false)
      const quiet = wrapper.get('.assistant-activity-row-quiet')
      expect(quiet.element).toBe(row)
      expect(quiet.text()).toContain('已思考')
      expect(quiet.classes()).not.toContain('activity-summary-shimmer-text')
      const paragraph = wrapper.get('[data-assistant-content-body] p').element
      await wrapper.setProps({ content: '第一段正文继续追加' })
      expect(wrapper.get('.assistant-activity-row-quiet').element).toBe(row)
      expect(wrapper.get('[data-assistant-content-body] p').element).toBe(paragraph)
      expect(wrapper.find('[data-assistant-content-body]').element.tagName).toBe('DIV')

      await wrapper.setProps({
        loading: false,
        message: messageFor([{ thinking: '分析任务', text: '第一段正文继续追加', toolCalls: [] }]),
      })
      expect(wrapper.find('.assistant-activity-row-quiet').exists()).toBe(false)
      expect(wrapper.get('.assistant-final-activity-row').element).toBe(row)
      expect(wrapper.findAll('.assistant-final-activity-row')).toHaveLength(1)
    } finally {
      wrapper.unmount()
    }
  })

  it('没有任何活动的纯文本回复：首个 token 前显示等待提示，之后不占位', async () => {
    const wrapper = mountRunningMessage()
    try {
      expect(wrapper.find('.message-status-slot').exists()).toBe(true)
      await wrapper.setProps({ content: '直接开始回答' })
      expect(wrapper.find('.message-status-slot').exists()).toBe(false)
      expect(wrapper.find('.assistant-activity-row-quiet').exists()).toBe(false)
      await wrapper.setProps({ loading: false })
      expect(wrapper.find('.assistant-final-activity-row').exists()).toBe(false)
    } finally {
      wrapper.unmount()
    }
  })

  it('正文被清空时状态行重新出现且可交互', async () => {
    const wrapper = mountRunningMessage([{ thinking: '分析任务', text: '', toolCalls: [] }])
    try {
      await wrapper.setProps({ content: '正文' })
      await wrapper.setProps({ content: '' })
      const status = wrapper.get('.message-status-slot')
      expect(status.attributes('inert')).toBeUndefined()
      expect(status.attributes('aria-hidden')).not.toBe('true')
      expect(wrapper.findAll('.message-status-slot')).toHaveLength(1)
    } finally {
      wrapper.unmount()
    }
  })

  it('生成时不累积已完成阶段，结束后只保留正文前总汇总', async () => {
    const pinia = createPinia()
    setActivePinia(pinia)
    const wrapper = mount(AssistantMessage, {
      props: {
        index: 0,
        cid: 'test-message',
        loading: true,
        isLast: true,
        message: JSON.stringify({
          role: 'assistant',
          rounds: [
            {
              text: '阶段一',
              toolCalls: [
                {
                  id: 'test-tool',
                  name: 'bash',
                  status: 'success',
                  input: {},
                  output: { stdout: 'done' },
                },
              ],
            },
            { text: '阶段二', toolCalls: [] },
          ],
        }),
      },
      global: {
        plugins: [pinia, i18n],
        provide: chatActionsProvide(),
        stubs: {
          MarkdownVNodeRenderer: { props: ['source'], template: '<p>{{ source }}</p>' },
          MediaOutput: true,
        },
      },
    })
    try {
      expect(wrapper.findAll('.assistant-stage-activity-row')).toHaveLength(0)
      expect(wrapper.find('.assistant-final-activity-row').exists()).toBe(false)
      // 已有工具、此刻无活动在跑：正文上方只有一行静态汇总，不逐阶段累积
      expect(wrapper.findAll('.assistant-activity-row-quiet')).toHaveLength(1)
      const rounds = wrapper.findAll('.round-container')
      expect(rounds[0].find('.assistant-stage-activity-row').exists()).toBe(false)
      expect(rounds[1].find('.assistant-stage-activity-row').exists()).toBe(false)
      expect(wrapper.find('.message-status-slot').exists()).toBe(false)
      await wrapper.setProps({ loading: false })
      expect(wrapper.find('.assistant-stage-activity-row').exists()).toBe(false)
      const summary = wrapper.get('.assistant-final-activity-row').element
      expect(wrapper.findAll('.assistant-final-activity-row')).toHaveLength(1)
      expect(
        summary.compareDocumentPosition(wrapper.get('.message-content-shell').element) &
          Node.DOCUMENT_POSITION_FOLLOWING
      ).toBeTruthy()
      expect(wrapper.findAll('.round-container')).toHaveLength(2)
    } finally {
      wrapper.unmount()
    }
  })

  it('空助手占位立即显示不计时的思考提示，正文到达后收起', async () => {
    vi.useFakeTimers()
    const wrapper = mountRunningMessage()
    try {
      const status = wrapper.get('.message-status-slot')
      expect(status.text()).toBe('正在思考')
      expect(status.attributes('aria-disabled')).toBe('true')
      expect(status.find('.tabular-nums').exists()).toBe(false)
      await vi.advanceTimersByTimeAsync(5000)
      expect(status.text()).toBe('正在思考')
      await wrapper.setProps({ content: '正在输出正文', progress: '旧思考提示' })
      expect(wrapper.find('.message-status-slot').exists()).toBe(false)
      const actions = wrapper.findAll('.assistant-action-layer')
      expect(actions.every(layer => layer.attributes('aria-hidden') === 'true')).toBe(true)
    } finally {
      wrapper.unmount()
      vi.useRealTimers()
    }
  })

  it('空 round 同样即时反馈，真实思考接续时复用同一状态行并启用详情和计时', async () => {
    vi.useFakeTimers()
    const wrapper = mountRunningMessage([{ text: null, thinking: null, toolCalls: [] }])
    try {
      const initial = wrapper.get('.message-status-slot').element
      await vi.advanceTimersByTimeAsync(5000)
      expect(wrapper.get('.message-status-slot').text()).toBe('正在思考')
      await wrapper.setProps({
        startedAt: new Date().toISOString(),
        message: messageFor([{ text: '', thinking: '分析任务', toolCalls: [] }]),
      })
      const status = wrapper.get('.message-status-slot')
      expect(status.element).toBe(initial)
      expect(wrapper.findAll('.message-status-slot')).toHaveLength(1)
      expect(status.attributes('aria-disabled')).toBe('false')
      expect(status.get('.tabular-nums').text()).toContain('秒')
    } finally {
      wrapper.unmount()
      vi.useRealTimers()
    }
  })

  it.each([ChatLogStatus.COMPLETED, ChatLogStatus.FAILED, ChatLogStatus.STOPPED])(
    '终态 %s 清除初始提示，即使 loading 尚未同步也不重新显示',
    async status => {
      const wrapper = mountRunningMessage()
      try {
        expect(wrapper.find('.message-status-slot').exists()).toBe(true)
        await wrapper.setProps({ status })
        expect(wrapper.find('.message-status-slot').exists()).toBe(false)
        await wrapper.setProps({ loading: false })
        expect(wrapper.find('.message-status-slot').exists()).toBe(false)
      } finally {
        wrapper.unmount()
      }
    }
  )

  it('失败、取消与已结束空 round 不显示初始提示', async () => {
    for (const props of [
      { error: true },
      { loading: false },
      { message: messageFor([{ text: '', thinking: '', toolCalls: [], completed: true }]) },
    ]) {
      const wrapper = mountRunningMessage()
      try {
        await wrapper.setProps(props)
        expect(wrapper.find('.message-status-slot').exists()).toBe(false)
      } finally {
        wrapper.unmount()
      }
    }
  })

  it('真实思考出现，正文先于 rounds 快照到达时立即收起', async () => {
    const wrapper = mountRunningMessage([{ thinking: '分析任务', text: '', toolCalls: [] }])
    try {
      expect(wrapper.find('.message-status-slot').exists()).toBe(true)
      await wrapper.setProps({ content: '第一段正文' })
      expect(wrapper.find('.message-status-slot').exists()).toBe(false)
      await wrapper.setProps({
        message: messageFor([{ thinking: '分析任务', text: '第一段正文', toolCalls: [] }]),
      })
      expect(wrapper.find('.message-status-slot').exists()).toBe(false)
    } finally {
      wrapper.unmount()
    }
  })

  it('已打开的活动面板跟随只在 liveToolCalls 里的实时进度', async () => {
    const wrapper = mountRunningMessage([{ text: '我来处理', toolCalls: [] }])
    const globalStore = useGlobalStore()
    const tool = (id: string) => ({ id, name: 'bash', arguments: {}, status: 'loading' as const })
    try {
      globalStore.openPanel({
        type: 'activity',
        activity: { messageId: 'activity-test', status: 'running', events: [] },
      })
      const panelToolEvents = () => {
        const panel = globalStore.rightPreviewPanel
        return panel?.type === 'activity' ? JSON.stringify(panel.activity.events) : ''
      }
      await wrapper.setProps({ liveToolCalls: [{ roundIndex: 0, toolCall: tool('t-1') }] })
      expect(panelToolEvents()).toContain('t-1')
      // 只换实时进度、message 不变：面板同步到新的工具
      await wrapper.setProps({
        liveToolCalls: [
          { roundIndex: 0, toolCall: { ...tool('t-1'), status: 'success' as const } },
          { roundIndex: 0, toolCall: tool('t-2') },
        ],
      })
      expect(panelToolEvents()).toContain('t-2')
    } finally {
      wrapper.unmount()
    }
  })

  it('正文后的工具只在执行中显示，成功或失败均立即消失；下一轮思考重新出现', async () => {
    const wrapper = mountRunningMessage([{ text: '我来处理', toolCalls: [] }])
    const tool = { id: 'test-tool', name: 'bash', arguments: {}, status: 'loading' as const }
    try {
      await wrapper.setProps({ liveToolCalls: [{ roundIndex: 0, toolCall: tool }] })
      expect(wrapper.find('.message-status-slot').exists()).toBe(true)
      for (const status of ['success', 'error'] as const) {
        await wrapper.setProps({
          liveToolCalls: [{ roundIndex: 0, toolCall: { ...tool, status } }],
        })
        expect(wrapper.find('.message-status-slot').exists()).toBe(false)
        expect(wrapper.find('.assistant-stage-activity-row').exists()).toBe(false)
      }
      await wrapper.setProps({
        liveToolCalls: [],
        message: messageFor([
          { text: '我来处理', completed: true, toolCalls: [{ ...tool, status: 'success' }] },
          { thinking: '核对结果', text: '', toolCalls: [] },
        ]),
      })
      expect(wrapper.get('.message-status-slot').text()).toContain('正在思考')
      expect(wrapper.findAll('.round-container')).toHaveLength(1)
      await wrapper.setProps({ loading: false })
      expect(wrapper.find('.message-status-slot').exists()).toBe(false)
      expect(wrapper.findAll('.assistant-final-activity-row')).toHaveLength(1)
    } finally {
      wrapper.unmount()
    }
  })

  it('运行中活动行排在正文之后，结束后换回正文之前，全程同一节点', async () => {
    const wrapper = mountRunningMessage([{ thinking: '分析任务', text: '', toolCalls: [] }])
    const slotOf = (selector: string) => wrapper.get(selector).element.parentElement as HTMLElement
    try {
      const row = wrapper.get('.message-status-slot').element
      const shell = wrapper.get('.message-content-shell').element as HTMLElement
      // live：正文下方
      expect(slotOf('.message-status-slot').className).toContain('order-3')
      expect(slotOf('.message-status-slot').className).toContain('pt-3')
      expect(shell.className).toContain('order-2')

      // quiet（思考完在写正文）：仍在正文下方
      await wrapper.setProps({ content: '第一段正文' })
      expect(wrapper.get('.assistant-activity-row-quiet').element).toBe(row)
      expect(slotOf('.assistant-activity-row-quiet').className).toContain('order-3')

      // final：回到正文上方，节点不变
      await wrapper.setProps({
        loading: false,
        message: messageFor([{ thinking: '分析任务', text: '第一段正文', toolCalls: [] }]),
      })
      const summary = wrapper.get('.assistant-final-activity-row')
      expect(summary.element).toBe(row)
      expect(slotOf('.assistant-final-activity-row').className).toContain('order-1')
      expect(slotOf('.assistant-final-activity-row').className).toContain('pb-3')
      // 操作栏始终排在最后
      expect((wrapper.get('.message-action-row').element as HTMLElement).className).toContain(
        'order-4'
      )
    } finally {
      wrapper.unmount()
    }
  })
})
