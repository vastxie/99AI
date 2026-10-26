import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick, ref } from 'vue'
import i18n from '@/locales'
import { ChatLogStatus } from '@/constants/chatLogStatus'
import {
  computedStyle,
  installStylesheet,
  mountProbe,
  readStyle,
  rootVar,
} from '@/styles/stylesheet.testkit'
import CodeBlock from './Text/CodeBlock.vue'
import AssistantMessage from './Text/AssistantMessage.vue'
import UserMessage from './Text/UserMessage.vue'
import { chatActionsProvide } from '@/views/chat/chatActions.testkit'
import { useChatStore } from '@/store/modules/chat'

const clipboard = vi.hoisted(() => ({ copyText: vi.fn() }))

vi.mock('./Text/highlightThemeStyles.helpers', () => ({ injectThemeStyles: vi.fn() }))
vi.mock('@/utils/clipboard', () => ({ copyText: clipboard.copyText }))
vi.mock('@/hooks/useViewport', async () => {
  const { ref } = await import('vue')
  return { useViewport: () => ({ isMobile: ref(false) }) }
})

let removeStyles: () => void
const wrappers: VueWrapper[] = []

function renderText(
  props: Record<string, unknown>,
  actions = chatActionsProvide(),
  component: typeof AssistantMessage | typeof UserMessage = AssistantMessage
) {
  const wrapper = mount(component as typeof AssistantMessage, {
    props: { index: 0, cid: 'presentation-test', ...props },
    global: {
      plugins: [createPinia(), i18n],
      provide: actions,
      stubs: { MediaOutput: true, MarkdownVNodeRenderer: true },
    },
  })
  wrappers.push(wrapper)
  return wrapper
}

const toolMessage = (status: 'loading' | 'success') =>
  JSON.stringify({
    text: 'done',
    rounds: [
      {
        text: 'done',
        thinking: '先看看资料',
        toolCalls: [{ id: 'call_1', name: 'web_search', status, input: { query: 'x' } }],
      },
    ],
  })

beforeAll(() => {
  removeStyles = installStylesheet(
    ['src/styles/tokens.css', 'src/styles/motion.css'].map(readStyle).join('\n')
  )
})

afterAll(() => {
  removeStyles()
})

beforeEach(() => {
  setActivePinia(createPinia())
  clipboard.copyText.mockResolvedValue(true)
})

afterEach(() => {
  wrappers.splice(0).forEach(wrapper => wrapper.unmount())
  document.body.innerHTML = ''
  vi.useRealTimers()
  vi.clearAllMocks()
})

describe('消息呈现契约', () => {
  it('活动行只有一个节点：运行中显示当前状态，结束后原地变为总汇总，且位于正文前', async () => {
    const wrapper = renderText({
      content: 'done',
      message: toolMessage('loading'),
      loading: true,
      status: 2,
    })
    const rows = wrapper.findAll('.message-status-slot')
    expect(rows).toHaveLength(1)
    expect(wrapper.findAll('.assistant-final-activity-row')).toHaveLength(0)
    expect(wrapper.findAll('.assistant-activity-row-quiet')).toHaveLength(0)
    const row = rows[0].element
    const body = wrapper.get('.message-content-shell').element
    expect(row.compareDocumentPosition(body) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    // 运行中操作栏保留高度但不可交互，活动状态只在正文上方那一行
    const controls = wrapper.get('.assistant-controls-slot')
    expect(controls.attributes('inert')).toBeDefined()
    expect(controls.attributes('aria-hidden')).toBe('true')

    await wrapper.setProps({ loading: false, status: 3, message: toolMessage('success') })
    await nextTick()
    expect(wrapper.findAll('.message-status-slot')).toHaveLength(0)
    const finalRows = wrapper.findAll('.assistant-final-activity-row')
    expect(finalRows).toHaveLength(1)
    expect(finalRows[0].element).toBe(row)
    expect(wrapper.get('.assistant-controls-slot').attributes('inert')).toBeUndefined()
    expect(wrapper.find('.assistant-stage-activity-row').exists()).toBe(false)
  })

  it('没有任何活动的纯文本回复结束后不占活动行', () => {
    const wrapper = renderText({ content: 'plain answer', status: 3 })
    expect(wrapper.find('.message-status-slot').exists()).toBe(false)
    expect(wrapper.find('.assistant-final-activity-row').exists()).toBe(false)
    expect(wrapper.get('.assistant-controls-slot').attributes('inert')).toBeUndefined()
  })

  it('消息与代码块的复制按钮共用反馈图标，三秒后复位，按钮关闭按压缩放', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    const cases: Array<{ name: string; wrapper: VueWrapper }> = [
      {
        name: 'user',
        wrapper: renderText({ content: 'question' }, chatActionsProvide(), UserMessage),
      },
      { name: 'assistant', wrapper: renderText({ content: 'answer', status: 3 }) },
    ]
    const codeBlock = mount(CodeBlock, {
      props: { code: 'const a = 1', language: 'javascript' },
      global: { plugins: [createPinia(), i18n], stubs: { CodePreviewSurface: true } },
    })
    wrappers.push(codeBlock)
    cases.push({ name: 'code', wrapper: codeBlock })

    for (const { name, wrapper } of cases) {
      const button = wrapper.get('button[aria-label="复制"]')
      expect(button.classes(), name).toContain('ui-button-no-scale')
      const feedback = button.get('.copy-feedback')
      expect(feedback.attributes('data-copied'), name).toBe('false')
      expect(feedback.findAll('svg'), name).toHaveLength(1)
      await button.trigger('click')
      await flushPromises()
      expect(feedback.attributes('data-copied'), name).toBe('true')
      vi.advanceTimersByTime(2999)
      await nextTick()
      expect(feedback.attributes('data-copied'), name).toBe('true')
      vi.advanceTimersByTime(1)
      await nextTick()
      expect(feedback.attributes('data-copied'), name).toBe('false')
      expect(button.get('.copy-feedback').element, name).toBe(feedback.element)
    }
    expect(clipboard.copyText).toHaveBeenCalledTimes(3)
  })

  it('代码块打开工作台的按钮写明「在工作台打开」，与「编辑提问」区分开', () => {
    const codeBlock = mount(CodeBlock, {
      props: { code: '<p>hi</p>', language: 'html', allowWorkspace: true },
      global: { plugins: [createPinia(), i18n], stubs: { CodePreviewSurface: true } },
    })
    wrappers.push(codeBlock)
    const open = codeBlock.get('button[aria-label="在工作台打开"]')
    expect(open.find('svg.lucide-maximize-2').exists()).toBe(true)
    expect(codeBlock.find('button[aria-label="编辑"]').exists()).toBe(false)
  })

  it('终态提示把工具轮次上限和用户点停分开', () => {
    const interrupted = (stopReason?: 'max_rounds') =>
      JSON.stringify({
        role: 'assistant',
        content: '写到一半',
        rounds: [],
        turn: {
          id: 'turn-1',
          status: 'interrupted',
          startedAt: '2026-09-19T00:00:00.000Z',
          ...(stopReason ? { stopReason } : {}),
        },
      })

    const stopped = renderText({
      content: '写到一半',
      status: ChatLogStatus.STOPPED,
      message: interrupted(),
    })
    expect(stopped.get('[role="status"]').text()).toBe('已停止生成')

    const capped = renderText({
      content: '写到一半',
      status: ChatLogStatus.STOPPED,
      message: interrupted('max_rounds'),
    })
    expect(capped.get('[role="status"]').text()).toContain('工具调用次数上限')

    // 刷新后：服务端把失败原因写在 content 里，状态行展示原因，正文不再重复
    const failed = renderText({ content: '模型服务暂时不可用', status: ChatLogStatus.FAILED })
    const failedStatus = failed.get('[role="status"]')
    expect(failedStatus.text()).toContain('回复生成失败')
    expect(failedStatus.text()).toContain('模型服务暂时不可用')
    expect(failed.findAll('.md-prose')).toHaveLength(0)
  })

  it('输出达到上限的回复照常显示，并提示可能没写完', () => {
    const completed = (stopReason?: 'length') =>
      JSON.stringify({
        role: 'assistant',
        content: '第一部分写完了，第二部分',
        rounds: [],
        turn: {
          id: 'turn-1',
          status: 'completed',
          startedAt: '2026-10-01T00:00:00.000Z',
          ...(stopReason ? { stopReason } : {}),
        },
      })

    const truncated = renderText({
      content: '第一部分写完了，第二部分',
      status: ChatLogStatus.COMPLETED,
      message: completed('length'),
    })
    expect(truncated.get('[role="status"]').text()).toContain('单次输出上限')
    expect(truncated.findAll('.md-prose')).toHaveLength(1)

    const normal = renderText({
      content: '第一部分写完了，第二部分',
      status: ChatLogStatus.COMPLETED,
      message: completed(),
    })
    expect(normal.find('[role="status"]').exists()).toBe(false)
  })

  it('失败的回复就地给出原因与重试；服务端说明不能重试的不给重试', async () => {
    const requestRegenerate = vi.fn(async () => undefined)
    const failed = renderText(
      {
        index: 3,
        content: '写到一半',
        error: true,
        status: ChatLogStatus.FAILED,
        errorMessage: '上游超时',
      },
      chatActionsProvide({ requestRegenerate })
    )
    const status = failed.get('[role="status"]')
    expect(status.text()).toContain('上游超时')
    await status.get('button').trigger('click')
    expect(requestRegenerate).toHaveBeenCalledWith(3)

    const blocked = renderText({
      error: true,
      status: ChatLogStatus.FAILED,
      errorMessage: '内容不合规',
      retryDisabled: true,
    })
    expect(blocked.get('[role="status"]').find('button').exists()).toBe(false)
  })

  it('本页跟丢的回复：说明原因并给出重新连接与停止；重连中显示进行中', async () => {
    const reconnect = vi.fn(async () => undefined)
    const stop = vi.fn(async () => undefined)
    const stalled = renderText(
      {
        cid: 'a-7',
        status: ChatLogStatus.GENERATING,
        recovery: 'stalled',
        recoveryMessage: '任务不存在',
      },
      chatActionsProvide({ reconnect, stop })
    )
    const status = stalled.get('[role="status"]')
    expect(status.text()).toContain('任务不存在')
    const [reconnectButton, stopButton] = status.findAll('button')
    expect(reconnectButton.text()).toContain('重新连接')
    await reconnectButton.trigger('click')
    expect(reconnect).toHaveBeenCalledWith('a-7')
    // 服务端可能仍在跑：也可以直接停止它
    expect(stopButton.text()).toContain('停止生成')
    await stopButton.trigger('click')
    expect(stop).toHaveBeenCalledWith('a-7')

    // 另一轮正在发出或生成：重新连接会挤掉它，先停用；停止请求在路上时停止键停用
    const busy = renderText(
      { cid: 'a-7', status: ChatLogStatus.GENERATING, recovery: 'stalled' },
      chatActionsProvide({ isTurnBusy: ref(true), isStopping: () => true })
    )
    const busyButtons = busy.get('[role="status"]').findAll('button')
    expect(busyButtons[0].attributes('disabled')).toBeDefined()
    expect(busyButtons[1].attributes('disabled')).toBeDefined()
    expect(busyButtons[1].text()).toContain('正在停止')

    // 停止中只看这条自己的 cid：停的是别的回复时，这里的停止键照常可用
    const isStopping = vi.fn((cid?: string) => cid === 'a-other')
    const other = renderText(
      { cid: 'a-7', status: ChatLogStatus.GENERATING, recovery: 'stalled' },
      chatActionsProvide({ isStopping })
    )
    const otherStop = other.get('[role="status"]').findAll('button')[1]
    expect(otherStop.attributes('disabled')).toBeUndefined()
    expect(otherStop.text()).toContain('停止生成')
    expect(isStopping).toHaveBeenCalledWith('a-7')

    const reconnecting = renderText({
      loading: true,
      status: ChatLogStatus.GENERATING,
      recovery: 'reconnecting',
    })
    expect(reconnecting.get('[role="status"]').text()).toContain('正在重新连接')
    expect(reconnecting.get('[role="status"]').find('button').exists()).toBe(false)
  })

  it('新消息入场只做一次快速淡入位移，时长取自共享快档', () => {
    const entering = mountProbe('chat-message-enter')
    const animation = computedStyle(entering).animation
    expect(animation).toMatch(/^chat-message-appear /)
    expect(animation).toContain(rootVar('--motion-duration-lg'))
    expect(animation).not.toContain('infinite')
    const keyframes = Array.from(document.styleSheets).flatMap(sheet =>
      Array.from(sheet.cssRules).filter(
        rule => rule instanceof CSSKeyframesRule && rule.name === 'chat-message-appear'
      )
    )
    expect(keyframes).toHaveLength(1)
  })

  describe('回答、过程话术、成果文件与提问', () => {
    const fileA = 'file_' + 'a'.repeat(24)
    const fileB = 'file_' + 'b'.repeat(24)
    const fileItem = (fileId: string, title: string) => ({
      type: 'file',
      id: fileId,
      fileId,
      title,
      role: 'final',
      visibility: 'private',
    })
    const bashCall = {
      id: 'call_bash',
      name: 'bash',
      type: 'tool',
      status: 'success',
      output: { files: [fileItem(fileA, 'clean.py'), fileItem(fileB, 'report.pdf')] },
    }
    const presentCall = {
      id: 'call_present',
      name: '展示成果文件',
      type: 'presentation',
      status: 'success',
      display: { json: { presentation: [{ fileId: fileB, caption: '最终报告' }] } },
      output: { files: [fileItem(fileB, 'report.pdf')] },
    }
    const askCall = {
      id: 'call_ask',
      name: '向用户提问',
      type: 'question',
      status: 'success',
      display: { json: { question: { text: '要哪种风格？', options: ['科技感', '手绘'] } } },
    }
    const reply = (rounds: unknown[], turnStatus = 'completed') =>
      JSON.stringify({
        role: 'assistant',
        content: '',
        rounds,
        turn: { id: 'turn-1', status: turnStatus, startedAt: '2026-09-30T00:00:00.000Z' },
      })

    it('正文只有回答轮的文字；没有回答时显示最新一段过程话术', () => {
      const answered = renderText({
        status: ChatLogStatus.COMPLETED,
        message: reply([
          { text: '先整理数据。', thinking: null, phase: 'process', toolCalls: [bashCall] },
          { text: '结论：数据有效。', thinking: null, toolCalls: [] },
        ]),
      })
      expect(answered.findAll('.md-prose')).toHaveLength(1)
      expect(answered.find('.reply-note').exists()).toBe(false)

      const capped = renderText({
        status: ChatLogStatus.STOPPED,
        message: JSON.stringify({
          role: 'assistant',
          content: '',
          rounds: [
            { text: '先搜一下。', thinking: null, phase: 'process', toolCalls: [bashCall] },
            { text: '再抓几篇文章。', thinking: null, phase: 'process', toolCalls: [] },
          ],
          turn: {
            id: 'turn-2',
            status: 'interrupted',
            startedAt: '2026-09-30T00:00:00.000Z',
            stopReason: 'max_rounds',
          },
        }),
      })
      expect(capped.findAll('.reply-note')).toHaveLength(1)
      expect(capped.findAll('.md-prose')).toHaveLength(1)
      expect(capped.get('[role="status"]').text()).toContain('工具调用次数上限')
    })

    it('成果文件按清单集中展示，其余产物收进过程文件', async () => {
      const wrapper = renderText({
        status: ChatLogStatus.COMPLETED,
        message: reply([
          { text: '先整理数据。', thinking: null, phase: 'process', toolCalls: [bashCall] },
          { text: '报告已完成。', thinking: null, toolCalls: [presentCall] },
        ]),
      })
      // 各轮不再就地挂文件：只剩成果一张
      expect(wrapper.findAll('media-output-stub')).toHaveLength(1)
      expect(wrapper.text()).toContain('最终报告')
      const toggle = wrapper.get('button[aria-expanded]')
      expect(toggle.text()).toBe('过程文件 · 1')
      await toggle.trigger('click')
      expect(wrapper.findAll('media-output-stub')).toHaveLength(2)
    })

    it('正文里链接到已出卡片的文件时不重复出卡片（按 fileId，跨轮次）', () => {
      const link = `[report.pdf](/api/files/${fileB}/download)`
      const presentedOnlyId = {
        ...presentCall,
        output: { files: [{ type: 'file', fileId: fileB, title: 'report.pdf', role: 'final' }] },
      }
      const withPresentation = renderText({
        status: ChatLogStatus.COMPLETED,
        message: reply([
          { text: '先整理数据。', thinking: null, phase: 'process', toolCalls: [bashCall] },
          { text: `报告见 ${link}`, thinking: null, toolCalls: [presentedOnlyId] },
        ]),
      })
      expect(withPresentation.findAll('media-output-stub')).toHaveLength(1)

      const withoutPresentation = renderText({
        status: ChatLogStatus.COMPLETED,
        message: reply([
          { text: '先整理数据。', thinking: null, phase: 'process', toolCalls: [bashCall] },
          { text: `报告见 ${link}`, thinking: null, toolCalls: [] },
        ]),
      })
      // 只有过程轮就地的那组产物，回答里的链接不再多出一张
      expect(withoutPresentation.findAll('media-output-stub')).toHaveLength(1)
    })

    it('以提问收尾：只有最后一条且已完成时选项可点，连点只发一次；复制含问题不含过程话术', async () => {
      let release!: () => void
      const onConversation = vi.fn(
        () =>
          new Promise<undefined>(resolve => {
            release = () => resolve(undefined)
          })
      )
      const rounds = [
        { text: '先看看素材。', thinking: null, phase: 'process', toolCalls: [bashCall] },
        { text: '初稿已完成。', thinking: null, toolCalls: [askCall] },
      ]
      const wrapper = renderText(
        { status: ChatLogStatus.COMPLETED, isLast: true, message: reply(rounds) },
        chatActionsProvide({ onConversation })
      )
      const options = wrapper.findAll('.reply-question-option')
      expect(options.map(option => option.text())).toEqual(['科技感', '手绘'])
      expect(options.every(option => option.attributes('disabled') === undefined)).toBe(true)

      await options[0].trigger('click')
      await options[1].trigger('click')
      expect(onConversation).toHaveBeenCalledTimes(1)
      expect(onConversation).toHaveBeenCalledWith({ msg: '科技感' })
      expect(useChatStore().isSubmitting).toBe(true)
      release()
      await flushPromises()
      expect(useChatStore().isSubmitting).toBe(false)

      await wrapper.get('button[aria-label="复制"]').trigger('click')
      await flushPromises()
      expect(clipboard.copyText).toHaveBeenLastCalledWith(
        '初稿已完成。\n\n要哪种风格？\n1. 科技感\n2. 手绘'
      )

      const older = renderText({
        status: ChatLogStatus.COMPLETED,
        isLast: false,
        message: reply(rounds),
      })
      expect(
        older
          .findAll('.reply-question-option')
          .every(option => option.attributes('disabled') !== undefined)
      ).toBe(true)
      const running = renderText({
        status: ChatLogStatus.COMPLETED,
        isLast: true,
        loading: true,
        message: reply(rounds, 'running'),
      })
      expect(
        running
          .findAll('.reply-question-option')
          .every(option => option.attributes('disabled') !== undefined)
      ).toBe(true)
    })
  })
})
