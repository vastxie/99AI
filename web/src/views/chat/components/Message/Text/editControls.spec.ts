import { flushPromises, mount, type DOMWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import i18n from '@/locales'
import Footer from '../../Footer/index.vue'
import UserMessage from './UserMessage.vue'
import { chatActionsProvide } from '@/views/chat/chatActions.testkit'

vi.mock('./highlightThemeStyles.helpers', () => ({ injectThemeStyles: vi.fn() }))
const clipboard = vi.hoisted(() => ({ copyText: vi.fn(async (_text: string) => true) }))
vi.mock('@/utils/clipboard', () => clipboard)

function mountEditableMessage(send = vi.fn(), attachTo?: HTMLElement) {
  const pinia = createPinia()
  setActivePinia(pinia)
  const wrapper = mount(UserMessage, {
    attachTo,
    props: { index: 0, cid: 'edit-controls-test', content: 'Original text' },
    global: {
      plugins: [pinia, i18n],
      provide: chatActionsProvide({ onConversation: send }),
      stubs: { MediaOutput: true, MarkdownVNodeRenderer: true },
    },
  })
  return { wrapper, send }
}

describe('消息编辑操作按钮', () => {
  it('取消使用统一透明圆钮，丢弃草稿且不发送', async () => {
    const { wrapper, send } = mountEditableMessage()
    try {
      await wrapper.get('button[aria-label="编辑提问"]').trigger('click')
      await wrapper.get('textarea').setValue('Draft text')
      const cancel = wrapper.get('button[aria-label="取消"]')
      expect(cancel.classes()).toEqual(
        expect.arrayContaining([
          'ui-button',
          'btn-ghost',
          'ui-button-icon',
          'ui-button-pill',
          'ui-button-no-scale',
        ])
      )
      expect(cancel.get('svg').attributes('width')).toBe('18')
      await cancel.trigger('click')
      expect(wrapper.find('textarea').exists()).toBe(false)
      expect(send).not.toHaveBeenCalled()
      await wrapper.get('button[aria-label="编辑提问"]').trigger('click')
      expect(wrapper.get<HTMLTextAreaElement>('textarea').element.value).toBe('Original text')
    } finally {
      wrapper.unmount()
    }
  })

  it('编辑壳内只有取消与发送两枚圆钮，与输入栏复用同一套类名和向上箭头，没有私有手机按钮', async () => {
    const { wrapper } = mountEditableMessage()
    const footer = mount(Footer, {
      global: {
        plugins: [i18n],
        provide: chatActionsProvide(),
        stubs: { ModelSelector: true, FilePreview: true },
      },
    })
    // 只比较 UiButton 自己输出的类：变体、形态与按压缩放开关
    type Button = Omit<DOMWrapper<Element>, 'exists'>
    const buttonClasses = (button: Button) =>
      button
        .classes()
        .filter(name => /^(?:btn(?:-[a-z]+)?|ui-button(?:-[a-z-]+)?)$/.test(name))
        .sort()
    const arrow = (button: Button) => {
      const svg = button.get('svg.lucide-arrow-up')
      return [svg.attributes('width'), svg.attributes('height'), svg.attributes('stroke-width')]
    }
    try {
      await wrapper.get('button[aria-label="编辑提问"]').trigger('click')
      const shell = wrapper.get('.message-user-edit-shell')
      const buttons = shell.findAll('button')
      expect(buttons.map(button => button.attributes('aria-label'))).toEqual(['取消', '发送'])
      const [cancel, send] = buttons
      expect(shell.find('svg.lucide-send').exists()).toBe(false)
      expect(wrapper.find('.message-user-mobile-action').exists()).toBe(false)
      expect(wrapper.find('.btn-floating').exists()).toBe(false)

      const footerSend = footer.get('button.btn-send')
      const footerUpload = footer.get('button[aria-label="上传文件"]')
      expect(buttonClasses(send)).toEqual(buttonClasses(footerSend))
      expect(buttonClasses(send)).toContain('btn-send')
      expect(buttonClasses(cancel)).toEqual(buttonClasses(footerUpload))
      expect(buttonClasses(cancel)).toEqual([
        'btn',
        'btn-ghost',
        'ui-button',
        'ui-button-icon',
        'ui-button-no-scale',
        'ui-button-pill',
      ])
      expect(arrow(send)).toEqual(['20', '20', '2'])
      expect(arrow(send)).toEqual(arrow(footerSend))
      expect(cancel.get('svg.lucide-x').attributes('width')).toBe('18')
    } finally {
      footer.unmount()
      wrapper.unmount()
    }
  })

  it('发送使用主题色向上箭头，空白内容禁用，非空内容沿原路径发送', async () => {
    const { wrapper, send } = mountEditableMessage()
    try {
      await wrapper.get('button[aria-label="编辑提问"]').trigger('click')
      const submit = wrapper.get<HTMLButtonElement>('button.btn-send')
      expect(submit.classes()).toEqual(
        expect.arrayContaining([
          'ui-button',
          'btn-primary',
          'ui-button-icon',
          'ui-button-pill',
          'ui-button-no-scale',
        ])
      )
      expect(submit.find('svg.lucide-arrow-up').exists()).toBe(true)
      expect(submit.get('svg').attributes('width')).toBe('20')
      expect(submit.get('svg').attributes('stroke-width')).toBe('2')
      await wrapper.get('textarea').setValue('  \n ')
      expect(submit.element.disabled).toBe(true)
      submit.element.click()
      expect(send).not.toHaveBeenCalled()
      await wrapper.get('textarea').setValue('Updated text')
      expect(submit.element.disabled).toBe(false)
      await submit.trigger('click')
      expect(send).toHaveBeenCalledWith(
        expect.objectContaining({ msg: 'Updated text', cid: 'edit-controls-test' })
      )
    } finally {
      wrapper.unmount()
    }
  })

  it('进入编辑即聚焦到末尾；回车发送、Shift+回车换行、Esc 取消，输入法组词中的回车不处理', async () => {
    const host = document.body.appendChild(document.createElement('div'))
    const { wrapper, send } = mountEditableMessage(vi.fn(), host)
    try {
      await wrapper.get('button[aria-label="编辑提问"]').trigger('click')
      const textarea = wrapper.get<HTMLTextAreaElement>('textarea')
      expect(document.activeElement).toBe(textarea.element)
      expect(textarea.element.selectionStart).toBe('Original text'.length)

      await textarea.setValue('Updated text')
      await textarea.trigger('keydown', { key: 'Enter', shiftKey: true })
      await textarea.trigger('keydown', { key: 'Enter', isComposing: true })
      expect(send).not.toHaveBeenCalled()
      await textarea.trigger('keydown', { key: 'Enter' })
      expect(send).toHaveBeenCalledWith(expect.objectContaining({ msg: 'Updated text' }))
      await flushPromises()

      await wrapper.get('button[aria-label="编辑提问"]').trigger('click')
      await wrapper.get('textarea').trigger('keydown', { key: 'Escape' })
      expect(wrapper.find('textarea').exists()).toBe(false)
    } finally {
      wrapper.unmount()
      host.remove()
    }
  })

  it('用户取消了删除后续对话的确认、或发送失败时，保留编辑框和草稿', async () => {
    for (const send of [
      vi.fn().mockResolvedValue(false),
      vi.fn().mockRejectedValue(new Error('x')),
    ]) {
      const { wrapper } = mountEditableMessage(send)
      try {
        await wrapper.get('button[aria-label="编辑提问"]').trigger('click')
        await wrapper.get('textarea').setValue('Updated text')
        await wrapper.get('button.btn-send').trigger('click')
        await flushPromises()
        expect(send).toHaveBeenCalledTimes(1)
        expect(wrapper.get<HTMLTextAreaElement>('textarea').element.value).toBe('Updated text')
      } finally {
        wrapper.unmount()
      }
    }
  })

  it('发出途中再按回车、按住回车的连发、再点发送都不会再发；有一轮在进行时发送键停用', async () => {
    let finish = (_value?: boolean) => {}
    const send = vi.fn(
      () =>
        new Promise<boolean | undefined>(resolve => {
          finish = resolve
        })
    )
    const { wrapper } = mountEditableMessage(send)
    try {
      await wrapper.get('button[aria-label="编辑提问"]').trigger('click')
      const textarea = wrapper.get('textarea')
      await textarea.setValue('Updated text')
      await textarea.trigger('keydown', { key: 'Enter' })
      await textarea.trigger('keydown', { key: 'Enter' })
      await textarea.trigger('keydown', { key: 'Enter', repeat: true })
      expect(wrapper.get<HTMLButtonElement>('button.btn-send').element.disabled).toBe(true)
      expect(send).toHaveBeenCalledTimes(1)
      finish(undefined)
      await flushPromises()
      expect(wrapper.find('textarea').exists()).toBe(false)
    } finally {
      wrapper.unmount()
    }

    const pinia = createPinia()
    setActivePinia(pinia)
    const busy = mount(UserMessage, {
      props: { index: 0, cid: 'busy', content: 'Original text' },
      global: {
        plugins: [pinia, i18n],
        provide: chatActionsProvide({ onConversation: send, isTurnBusy: ref(true) }),
        stubs: { MediaOutput: true },
      },
    })
    try {
      await busy.get('button[aria-label="编辑提问"]').trigger('click')
      await busy.get('textarea').setValue('Updated text')
      expect(busy.get<HTMLButtonElement>('button.btn-send').element.disabled).toBe(true)
      await busy.get('textarea').trigger('keydown', { key: 'Enter' })
      expect(send).toHaveBeenCalledTimes(1)
    } finally {
      busy.unmount()
    }
  })

  it('带引用发出的提问拆成引用块与问题显示，不露出拼接用的标签', () => {
    const pinia = createPinia()
    setActivePinia(pinia)
    const content = '引用内容（来源：q3.xlsx）：\n表格第 3 行\n\n用户问题：\n为什么下降？'
    const wrapper = mount(UserMessage, {
      props: { index: 0, cid: 'quoted', content },
      global: {
        plugins: [pinia, i18n],
        provide: chatActionsProvide(),
        stubs: { MediaOutput: true },
      },
    })
    try {
      expect(wrapper.get('.message-user-quote-source').text()).toBe('q3.xlsx')
      expect(wrapper.get('.message-user-quote-text').text()).toBe('表格第 3 行')
      expect(wrapper.get('.message-user-bubble-content').text()).toBe('为什么下降？')
      expect(wrapper.text()).not.toContain('用户问题')
    } finally {
      wrapper.unmount()
    }
  })

  it('带引用的提问：编辑、复制的都是问题本身，引用留在上面；发出时重新拼上原来的引用', async () => {
    const pinia = createPinia()
    setActivePinia(pinia)
    const send = vi.fn(async () => undefined)
    const content = '引用内容（来源：q3.xlsx）：\n表格第 3 行\n\n用户问题：\n为什么下降？'
    const wrapper = mount(UserMessage, {
      props: { index: 0, cid: 'quoted-edit', content },
      global: {
        plugins: [pinia, i18n],
        provide: chatActionsProvide({ onConversation: send }),
        stubs: { MediaOutput: true },
      },
    })
    try {
      await wrapper.get('button[aria-label="复制"]').trigger('click')
      expect(clipboard.copyText).toHaveBeenCalledWith('为什么下降？')

      await wrapper.get('button[aria-label="编辑提问"]').trigger('click')
      expect(wrapper.get<HTMLTextAreaElement>('textarea').element.value).toBe('为什么下降？')
      expect(wrapper.get('.message-user-edit-shell .message-user-quote-text').text()).toBe(
        '表格第 3 行'
      )
      await wrapper.get('textarea').setValue('为什么上升？')
      await wrapper.get('button.btn-send').trigger('click')
      expect(send).toHaveBeenCalledWith(
        expect.objectContaining({
          msg: '引用内容（来源：q3.xlsx）：\n表格第 3 行\n\n用户问题：\n为什么上升？',
        })
      )
    } finally {
      wrapper.unmount()
    }
  })

  it('用户消息按原文显示：公式定界符与 [[1](链接)] 这类写法不被改写', () => {
    const content = '公式 \\(x^2\\) 与引用 [[1](https://example.com/a)]'
    const pinia = createPinia()
    setActivePinia(pinia)
    const wrapper = mount(UserMessage, {
      props: { index: 0, cid: 'raw-user-text', content },
      global: {
        plugins: [pinia, i18n],
        provide: chatActionsProvide(),
        stubs: { MediaOutput: true, MarkdownVNodeRenderer: true },
      },
    })
    try {
      expect(wrapper.get('.message-user-bubble-content').text()).toBe(content)
    } finally {
      wrapper.unmount()
    }
  })
})
