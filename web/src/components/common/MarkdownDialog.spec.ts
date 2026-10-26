import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import MarkdownDialog from './MarkdownDialog.vue'

function mountDialog(props: Record<string, unknown> = {}) {
  return mount(MarkdownDialog, {
    props: {
      visible: true,
      title: '平台公告',
      content: '# 你好\n\n正文 [链接](https://example.com)',
      confirmText: '确定',
      ...props,
    },
    global: { stubs: { transition: false } },
  })
}

describe('MarkdownDialog 配置类 Markdown 弹窗', () => {
  it('渲染标题、只读 Markdown 正文与确认文案，标题作为对话框的无障碍名称', () => {
    const wrapper = mountDialog()
    const dialog = wrapper.find('[role="dialog"]')
    expect(dialog.attributes('aria-modal')).toBe('true')
    const title = wrapper.find('h3.type-dialog-title')
    expect(title.text()).toBe('平台公告')
    expect(title.attributes('id')).toBeTruthy()
    expect(dialog.attributes('aria-labelledby')).toBe(title.attributes('id'))
    // DOMPurify 在 happy-dom 下会剥掉 h1（见 safeConfigMarkdown.spec 说明），只断言段落与链接
    expect(wrapper.find('.safe-markdown-preview').text()).toContain('你好')
    expect(wrapper.find('.safe-markdown-preview p').text()).toContain('正文')
    expect(wrapper.find('.safe-markdown-preview a').attributes('rel')).toBe('noopener noreferrer')
    expect(wrapper.find('.btn-primary').text()).toBe('确定')
    expect(wrapper.find('input[type="checkbox"]').exists()).toBe(false)
    wrapper.unmount()
  })

  it('确认关闭：先发 close（未勾选不再提醒）再发 update:visible=false', async () => {
    const wrapper = mountDialog()
    await wrapper.find('.btn-primary').trigger('click')
    expect(wrapper.emitted('close')).toEqual([[{ doNotRemind: false }]])
    expect(wrapper.emitted('update:visible')).toEqual([[false]])
    wrapper.unmount()
  })

  it('showDoNotRemind：显示复选框，勾选后随 close 事件返回 true，重新打开时重置', async () => {
    const wrapper = mountDialog({ showDoNotRemind: true })
    const checkbox = wrapper.find('input[type="checkbox"]')
    expect(checkbox.exists()).toBe(true)
    expect(wrapper.find('label').text()).not.toBe('')
    await checkbox.setValue(true)
    await wrapper.find('.btn-primary').trigger('click')
    expect(wrapper.emitted('close')).toEqual([[{ doNotRemind: true }]])

    await wrapper.setProps({ visible: false })
    await wrapper.setProps({ visible: true })
    expect((wrapper.find('input[type="checkbox"]').element as HTMLInputElement).checked).toBe(false)
    wrapper.unmount()
  })

  it('遮罩点击与关闭按钮同走关闭流程', async () => {
    const backdrop = mountDialog()
    await backdrop.find('.modal-backdrop').trigger('click')
    expect(backdrop.emitted('update:visible')).toEqual([[false]])
    backdrop.unmount()

    const closeButton = mountDialog()
    await closeButton.find('button[aria-label]').trigger('click')
    expect(closeButton.emitted('close')).toEqual([[{ doNotRemind: false }]])
    expect(closeButton.emitted('update:visible')).toEqual([[false]])
    closeButton.unmount()
  })
})
