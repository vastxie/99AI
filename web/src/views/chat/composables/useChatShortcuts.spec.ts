import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent } from 'vue'
import { useGlobalStoreWithOut } from '@/store/modules/global'
import { useChatShortcuts } from './useChatShortcuts'

const dialogs = vi.hoisted(() => ({ open: false }))
vi.mock('@/composables/useDialogA11y', () => ({ hasOpenDialog: () => dialogs.open }))

beforeEach(() => {
  setActivePinia(createPinia())
  dialogs.open = false
})

function setup() {
  const actions = { focusComposer: vi.fn(() => true), startNewConversation: vi.fn() }
  const wrapper = mount(
    defineComponent({
      setup() {
        useChatShortcuts(actions)
        return () => null
      },
    })
  )
  const press = (init: KeyboardEventInit) => {
    const event = new KeyboardEvent('keydown', { cancelable: true, ...init })
    document.dispatchEvent(event)
    return event
  }
  return { wrapper, actions, press }
}

describe('对话页快捷键', () => {
  it('Shift+Esc 聚焦输入框，Ctrl / ⌘ + Shift + O 开始新对话', () => {
    const { wrapper, actions, press } = setup()
    expect(press({ key: 'Escape', shiftKey: true }).defaultPrevented).toBe(true)
    expect(actions.focusComposer).toHaveBeenCalledTimes(1)

    press({ key: 'O', ctrlKey: true, shiftKey: true })
    press({ key: 'o', metaKey: true, shiftKey: true })
    expect(actions.startNewConversation).toHaveBeenCalledTimes(2)
    wrapper.unmount()
  })

  it('按键位认新对话：非拉丁键盘布局下 key 不是 o 也能用', () => {
    const { wrapper, actions, press } = setup()
    press({ key: 'щ', code: 'KeyO', ctrlKey: true, shiftKey: true })
    expect(actions.startNewConversation).toHaveBeenCalledTimes(1)
    wrapper.unmount()
  })

  it('拉丁布局按字母认：Dvorak 下 QWERTY 的 O 键位打出 R，Ctrl+Shift+R 留给浏览器刷新', () => {
    const { wrapper, actions, press } = setup()
    expect(press({ key: 'R', code: 'KeyO', ctrlKey: true, shiftKey: true }).defaultPrevented).toBe(
      false
    )
    expect(actions.startNewConversation).not.toHaveBeenCalled()
    // Dvorak 的 O 在 QWERTY 的 S 键位上
    press({ key: 'O', code: 'KeyS', ctrlKey: true, shiftKey: true })
    expect(actions.startNewConversation).toHaveBeenCalledTimes(1)
    wrapper.unmount()
  })

  it('弹窗或代码工作台开着时不处理：焦点不跑到被盖住的输入框，工作台的修改不随新对话丢掉', () => {
    const { wrapper, actions, press } = setup()
    dialogs.open = true
    expect(press({ key: 'Escape', shiftKey: true }).defaultPrevented).toBe(false)
    press({ key: 'o', ctrlKey: true, shiftKey: true })
    dialogs.open = false
    useGlobalStoreWithOut().previewPanelState = { type: 'code' } as any
    press({ key: 'Escape', shiftKey: true })
    press({ key: 'o', ctrlKey: true, shiftKey: true })
    expect(actions.focusComposer).not.toHaveBeenCalled()
    expect(actions.startNewConversation).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it('单按 Esc、不带 Shift 的 Ctrl+O、输入法组词中的按键都不处理', () => {
    const { wrapper, actions, press } = setup()
    press({ key: 'Escape' })
    press({ key: 'o', ctrlKey: true })
    press({ key: 'Escape', shiftKey: true, isComposing: true })
    expect(actions.focusComposer).not.toHaveBeenCalled()
    expect(actions.startNewConversation).not.toHaveBeenCalled()
    wrapper.unmount()
  })
})
