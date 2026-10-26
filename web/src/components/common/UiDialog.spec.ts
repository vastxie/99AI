import { mount } from '@vue/test-utils'
import type { VueWrapper } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { nextTick } from 'vue'
import UiDialog from './UiDialog.vue'

const wrappers: VueWrapper[] = []
let trigger: HTMLButtonElement

function mountDialog(props: Record<string, unknown> = {}, attrs: Record<string, unknown> = {}) {
  const wrapper = mount(UiDialog, {
    props: { open: true, ...props },
    attrs,
    slots: {
      default: '<button id="first">first</button><button id="second">second</button>',
    },
    attachTo: document.body,
    global: { stubs: { transition: false } },
  })
  wrappers.push(wrapper)
  return wrapper
}

/** 等待 flush:post 的 watcher 与 useDialogA11y 内部 nextTick 落地 */
async function settle() {
  await nextTick()
  await nextTick()
}

function pressEscape() {
  document.dispatchEvent(
    new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })
  )
}

beforeEach(() => {
  trigger = document.createElement('button')
  document.body.appendChild(trigger)
  trigger.focus()
})

afterEach(() => {
  while (wrappers.length > 0) wrappers.pop()?.unmount()
  trigger.remove()
})

describe('UiDialog 居中弹窗外壳', () => {
  it('关闭时不渲染；打开时遮罩带层级，面板带对话框语义与调用方属性', async () => {
    const closed = mountDialog({ open: false })
    expect(closed.find('.modal-backdrop').exists()).toBe(false)

    const wrapper = mountDialog(
      { layer: 'critical', overlayClass: 'px-2' },
      { class: 'max-w-3xl p-4', 'aria-labelledby': 'dialog-title', id: 'panel' }
    )
    const overlay = wrapper.get('.modal-backdrop')
    expect(overlay.classes()).toEqual(
      expect.arrayContaining(['fixed', 'inset-0', 'z-critical', 'px-2'])
    )
    expect(overlay.attributes('aria-labelledby')).toBeUndefined()

    const panel = wrapper.get('#panel')
    expect(panel.element.parentElement).toBe(overlay.element)
    expect(panel.element.tagName).toBe('DIV')
    expect(panel.classes()).toEqual(expect.arrayContaining(['dialog-surface', 'max-w-3xl', 'p-4']))
    expect(panel.attributes()).toMatchObject({
      role: 'dialog',
      'aria-modal': 'true',
      tabindex: '-1',
      'aria-labelledby': 'dialog-title',
    })
    expect(panel.find('#first').exists()).toBe(true)
  })

  it('默认层级为 z-dialog，面板标签可换', () => {
    const wrapper = mountDialog({ as: 'section' })
    expect(wrapper.get('.modal-backdrop').classes()).toContain('z-dialog')
    expect(wrapper.get('[role="dialog"]').element.tagName).toBe('SECTION')
  })

  it('只有点在遮罩空白处才请求关闭，closeOnBackdrop=false 时不请求', async () => {
    const wrapper = mountDialog()
    await wrapper.get('[role="dialog"]').trigger('click')
    expect(wrapper.emitted('close')).toBeUndefined()
    await wrapper.get('.modal-backdrop').trigger('click')
    expect(wrapper.emitted('close')).toHaveLength(1)

    const pinned = mountDialog({ closeOnBackdrop: false })
    await pinned.get('.modal-backdrop').trigger('click')
    expect(pinned.emitted('close')).toBeUndefined()
  })

  it('Esc 请求关闭；closeOnEsc 在每次打开时读取', async () => {
    const wrapper = mountDialog({ closeOnEsc: false })
    await settle()
    pressEscape()
    expect(wrapper.emitted('close')).toBeUndefined()

    await wrapper.setProps({ open: false })
    await settle()
    await wrapper.setProps({ open: true, closeOnEsc: true })
    await settle()
    pressEscape()
    expect(wrapper.emitted('close')).toHaveLength(1)
  })

  it('打开时聚焦 initialFocus 指定的元素，关闭后焦点回到触发元素', async () => {
    const wrapper = mountDialog({
      open: false,
      initialFocus: () => document.getElementById('second'),
    })
    await wrapper.setProps({ open: true })
    await settle()
    expect(document.activeElement?.id).toBe('second')

    await wrapper.setProps({ open: false })
    await settle()
    expect(document.activeElement).toBe(trigger)
  })
})
