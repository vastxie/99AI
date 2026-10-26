import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp, defineComponent, h, nextTick, ref } from 'vue'
import type { App, Ref } from 'vue'
import { registerFloatingLayer, useDialogA11y } from './useDialogA11y'
import type { UseDialogA11yOptions } from './useDialogA11y'

interface Harness {
  visible: Ref<boolean>
  onClose: ReturnType<typeof vi.fn>
  app: App
  container: HTMLElement
  unmount: () => void
}

const harnesses: Harness[] = []
/** 测试内登记的外部浮层与临时节点，afterEach 统一清理 */
const teardown: Array<() => void> = []
let trigger: HTMLButtonElement

/** 造一个 Teleport 到 body 的浮层（下拉菜单）并登记到弹窗 a11y 层 */
function mountFloatingLayer(options: { id: string; handlesEscape?: boolean }) {
  const root = document.createElement('div')
  root.id = options.id
  const item = document.createElement('button')
  item.id = `${options.id}-item`
  root.appendChild(item)
  document.body.appendChild(root)

  const release = registerFloatingLayer({
    getRoot: () => root,
    handlesEscape: () => options.handlesEscape !== false,
  })

  let released = false
  const dispose = () => {
    if (released) return
    released = true
    release()
    root.remove()
  }
  teardown.push(dispose)

  return { root, item, dispose }
}

/** 等待 flush:post 的 watcher 与 composable 内部 nextTick 全部落地 */
async function settle() {
  await nextTick()
  await nextTick()
}

function pressKey(
  key: string,
  target: EventTarget = document,
  init: KeyboardEventInit = {}
): KeyboardEvent {
  const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init })
  target.dispatchEvent(event)
  return event
}

interface HarnessConfig {
  id: string
  options?: Omit<UseDialogA11yOptions, 'onClose'>
  /** 弹窗体内容；缺省渲染 first / second 两个按钮 */
  children?: () => ReturnType<typeof h>[]
  /** onClose 是否同时把 visible 置 false（模拟业务关闭），默认 true */
  closeSetsVisible?: boolean
}

function mountDialog(config: HarnessConfig): Harness {
  const visible = ref(false)
  const onClose = vi.fn(() => {
    if (config.closeSetsVisible !== false) visible.value = false
  })

  const Comp = defineComponent({
    setup() {
      const { setDialogRef, dialogAttrs } = useDialogA11y(visible, {
        ...config.options,
        onClose,
      })
      return () =>
        visible.value
          ? h(
              'div',
              { ref: setDialogRef, ...dialogAttrs, id: config.id },
              config.children
                ? config.children()
                : [
                    h('button', { id: `${config.id}-first` }, 'first'),
                    h('button', { id: `${config.id}-second` }, 'second'),
                  ]
            )
          : null
    },
  })

  const container = document.createElement('div')
  document.body.appendChild(container)
  const app = createApp(Comp)
  app.mount(container)

  const harness: Harness = {
    visible,
    onClose,
    app,
    container,
    unmount: () => {
      app.unmount()
      container.remove()
    },
  }
  harnesses.push(harness)
  return harness
}

function byId(id: string): HTMLElement {
  const el = document.getElementById(id)
  if (!el) throw new Error(`element #${id} not found`)
  return el
}

beforeEach(() => {
  trigger = document.createElement('button')
  trigger.id = 'outside-trigger'
  document.body.appendChild(trigger)
  trigger.focus()
})

afterEach(async () => {
  while (harnesses.length > 0) {
    harnesses.pop()?.unmount()
  }
  while (teardown.length > 0) {
    teardown.pop()?.()
  }
  await settle()
  trigger.remove()
})

describe('useDialogA11y', () => {
  it('常驻动画页的 inert / aria-hidden 子按钮不进入 Tab 焦点环', async () => {
    const rects = vi
      .spyOn(HTMLElement.prototype, 'getClientRects')
      .mockReturnValue([{ width: 20, height: 20 }] as unknown as DOMRectList)
    teardown.push(() => rects.mockRestore())
    const { visible } = mountDialog({
      id: 'dlg-pages',
      children: () => [
        h('div', { 'aria-hidden': 'true' }, [h('button', { id: 'hidden-first' }, 'hidden')]),
        h('button', { id: 'active-first' }, 'first'),
        h('button', { id: 'active-last' }, 'last'),
        h('div', { inert: true }, [h('button', { id: 'hidden-last' }, 'hidden')]),
      ],
    })
    visible.value = true
    await settle()
    expect(document.activeElement).toBe(byId('active-first'))
    byId('active-last').focus()
    expect(pressKey('Tab', byId('active-last')).defaultPrevented).toBe(true)
    expect(document.activeElement).toBe(byId('active-first'))
    expect(pressKey('Tab', byId('active-first'), { shiftKey: true }).defaultPrevented).toBe(true)
    expect(document.activeElement).toBe(byId('active-last'))
  })

  it('打开时在根节点写入 role / aria-modal / tabindex', async () => {
    const { visible } = mountDialog({ id: 'dlg-attrs' })
    visible.value = true
    await settle()

    const root = byId('dlg-attrs')
    expect(root.getAttribute('role')).toBe('dialog')
    expect(root.getAttribute('aria-modal')).toBe('true')
    expect(root.getAttribute('tabindex')).toBe('-1')
  })

  it('打开时聚焦第一个可聚焦元素，关闭后焦点返回触发元素', async () => {
    const { visible } = mountDialog({ id: 'dlg-focus' })
    expect(document.activeElement).toBe(trigger)

    visible.value = true
    await settle()
    expect(document.activeElement).toBe(byId('dlg-focus-first'))

    visible.value = false
    await settle()
    expect(document.activeElement).toBe(trigger)
  })

  it('支持 initialFocus 指定初始聚焦元素', async () => {
    const { visible } = mountDialog({
      id: 'dlg-initial',
      options: { initialFocus: () => document.getElementById('dlg-initial-second') },
    })
    visible.value = true
    await settle()
    expect(document.activeElement).toBe(byId('dlg-initial-second'))
  })

  it('无可聚焦元素时聚焦弹窗容器本身', async () => {
    const { visible } = mountDialog({
      id: 'dlg-empty',
      children: () => [h('button', { id: 'dlg-empty-btn', disabled: '' }, 'disabled')],
    })
    visible.value = true
    await settle()
    expect(document.activeElement).toBe(byId('dlg-empty'))
  })

  it('Esc 触发 onClose 并 preventDefault', async () => {
    const { visible, onClose } = mountDialog({ id: 'dlg-esc' })
    visible.value = true
    await settle()

    const event = pressKey('Escape')
    expect(onClose).toHaveBeenCalledTimes(1)
    expect(event.defaultPrevented).toBe(true)
  })

  it('多层弹窗时 Esc 只关最上层，再按才关下一层', async () => {
    const lower = mountDialog({ id: 'dlg-lower' })
    lower.visible.value = true
    await settle()

    const upper = mountDialog({ id: 'dlg-upper' })
    upper.visible.value = true
    await settle()

    pressKey('Escape')
    await settle()
    expect(upper.onClose).toHaveBeenCalledTimes(1)
    expect(lower.onClose).not.toHaveBeenCalled()

    pressKey('Escape')
    await settle()
    expect(lower.onClose).toHaveBeenCalledTimes(1)
  })

  it('closeOnEsc: false 时 Esc 不关闭该层，也不透传给下层', async () => {
    const lower = mountDialog({ id: 'dlg-under' })
    lower.visible.value = true
    await settle()

    const forced = mountDialog({ id: 'dlg-forced', options: { closeOnEsc: false } })
    forced.visible.value = true
    await settle()

    pressKey('Escape')
    expect(forced.onClose).not.toHaveBeenCalled()
    expect(lower.onClose).not.toHaveBeenCalled()
  })

  it('事件已被内层处理（defaultPrevented）时不响应 Esc', async () => {
    const { onClose, visible } = mountDialog({ id: 'dlg-prevented' })
    visible.value = true
    await settle()

    const event = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })
    event.preventDefault()
    document.dispatchEvent(event)
    expect(onClose).not.toHaveBeenCalled()
  })

  it('焦点位于弹窗外的其他浮层时不响应 Esc（如 Teleport 菜单）', async () => {
    const { onClose, visible } = mountDialog({ id: 'dlg-layer' })
    visible.value = true
    await settle()

    const floating = document.createElement('button')
    floating.id = 'floating-menu-item'
    document.body.appendChild(floating)
    floating.focus()

    pressKey('Escape', floating)
    expect(onClose).not.toHaveBeenCalled()
    floating.remove()
  })

  it('弹窗之上登记了自行处理 Esc 的浮层时让位，浮层注销后再按才关弹窗', async () => {
    const { onClose, visible } = mountDialog({ id: 'dlg-floating-esc' })
    visible.value = true
    await settle()

    // 鼠标点开下拉：焦点仍留在弹窗内的触发按钮上，判定不能依赖焦点位置
    const dialogButton = byId('dlg-floating-esc-first')
    dialogButton.focus()
    const layer = mountFloatingLayer({ id: 'floating-menu' })

    pressKey('Escape', dialogButton)
    expect(onClose).not.toHaveBeenCalled()

    layer.dispose()
    pressKey('Escape', dialogButton)
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('浮层声明不处理 Esc（强制常开的菜单）时不影响弹窗关闭', async () => {
    const { onClose, visible } = mountDialog({ id: 'dlg-floating-passthrough' })
    visible.value = true
    await settle()

    mountFloatingLayer({ id: 'sticky-menu', handlesEscape: false })

    pressKey('Escape', byId('dlg-floating-passthrough-first'))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('弹窗打开前就存在的浮层不吞掉 Esc', async () => {
    mountFloatingLayer({ id: 'stale-menu' })

    const { onClose, visible } = mountDialog({ id: 'dlg-after-layer' })
    visible.value = true
    await settle()

    pressKey('Escape', byId('dlg-after-layer-first'))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('焦点位于已登记浮层内时 Tab 不被拉回弹窗', async () => {
    const { visible } = mountDialog({ id: 'dlg-floating-tab' })
    visible.value = true
    await settle()

    const layer = mountFloatingLayer({ id: 'floating-tab-menu' })
    layer.item.focus()

    const event = pressKey('Tab', layer.item)
    expect(event.defaultPrevented).toBe(false)
    expect(document.activeElement).toBe(layer.item)
  })

  it('触发元素已不可聚焦时回退到最近的可聚焦祖先', async () => {
    const dropdownTrigger = document.createElement('div')
    dropdownTrigger.id = 'dd-trigger'
    dropdownTrigger.tabIndex = 0
    const menuItem = document.createElement('button')
    menuItem.id = 'dd-item'
    dropdownTrigger.appendChild(menuItem)
    document.body.appendChild(dropdownTrigger)
    teardown.push(() => dropdownTrigger.remove())

    menuItem.focus()

    const { visible } = mountDialog({ id: 'dlg-restore-fallback' })
    visible.value = true
    await settle()
    expect(document.activeElement).toBe(byId('dlg-restore-fallback-first'))

    // 菜单随弹窗打开而收起：原触发元素已无法接收焦点
    menuItem.setAttribute('disabled', '')

    visible.value = false
    await settle()
    expect(document.activeElement).toBe(dropdownTrigger)
  })

  it('Tab 在弹窗内循环，Shift+Tab 反向循环', async () => {
    const { visible } = mountDialog({ id: 'dlg-trap' })
    visible.value = true
    await settle()

    const first = byId('dlg-trap-first')
    const second = byId('dlg-trap-second')

    second.focus()
    const tabEvent = pressKey('Tab', second)
    expect(tabEvent.defaultPrevented).toBe(true)
    expect(document.activeElement).toBe(first)

    const shiftTabEvent = pressKey('Tab', first, { shiftKey: true })
    expect(shiftTabEvent.defaultPrevented).toBe(true)
    expect(document.activeElement).toBe(second)
  })

  it('焦点在弹窗外时 Tab 拉回弹窗内', async () => {
    const { visible } = mountDialog({ id: 'dlg-pull' })
    visible.value = true
    await settle()

    trigger.focus()
    const event = pressKey('Tab', trigger)
    expect(event.defaultPrevented).toBe(true)
    expect(document.activeElement).toBe(byId('dlg-pull-first'))
  })

  it('组件卸载时出栈并移除监听，焦点返回触发元素', async () => {
    const harness = mountDialog({ id: 'dlg-unmount', closeSetsVisible: false })
    harness.visible.value = true
    await settle()
    expect(document.activeElement).toBe(byId('dlg-unmount-first'))

    harness.unmount()
    await settle()
    expect(document.activeElement).toBe(trigger)

    // 卸载后 Esc 不再触发 onClose（监听已移除 / 已出栈）
    pressKey('Escape')
    expect(harness.onClose).not.toHaveBeenCalled()
  })
})
