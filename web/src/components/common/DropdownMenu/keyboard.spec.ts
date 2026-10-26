import { useDialogA11y } from '@/composables/useDialogA11y'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp, defineComponent, h, nextTick, ref } from 'vue'
import type { Ref, VNodeChild } from 'vue'
import DropdownMenu from './index.vue'
import UiButton from '../UiButton.vue'

interface MenuSlotProps {
  close: () => void
}

interface TriggerSlotProps {
  triggerProps: Record<string, unknown>
}

const cleanups: Array<() => void> = []

describe('组合控件浮层锚点', () => {
  it('以外层输入框等宽定位并保留 8px 间距，不压住框内触发按钮', async () => {
    mountMenu({
      menu: () => h('button', { role: 'menuitem' }, 'model'),
      props: {
        teleport: true,
        position: 'top-right',
        anchorSelector: '.composer-anchor',
        matchAnchorWidth: true,
      },
    })
    const trigger = byId('menu-trigger')
    const anchor = trigger.closest('.menu')!.parentElement!
    anchor.classList.add('composer-anchor')
    vi.spyOn(anchor, 'getBoundingClientRect').mockReturnValue({
      x: 8,
      y: 580,
      left: 8,
      top: 580,
      right: 312,
      bottom: 700,
      width: 304,
      height: 120,
      toJSON() {},
    })
    trigger.click()
    await settle()
    const menu = document.querySelector<HTMLElement>('.menu-items')!
    Object.defineProperty(menu, 'offsetHeight', { configurable: true, value: 100 })
    window.dispatchEvent(new Event('resize'))
    await settle()
    expect(menu.style.left).toBe('8px')
    expect(menu.style.top).toBe('auto')
    expect(menu.style.bottom).toBe(`${window.innerHeight - 572}px`)
    expect(menu.style.width).toBe('304px')
    expect(menu.style.maxWidth).toBe('304px')
  })
})

describe('菜单层级', () => {
  it('挂到 body 的菜单用浮层档位（盖过弹窗、抽屉与底部面板），留在原地的用下拉档位', async () => {
    for (const [teleport, layer] of [
      [true, 'var(--z-menu-overlay)'],
      [false, 'var(--z-dropdown)'],
    ] as const) {
      mountMenu({ menu: () => h('button', { role: 'menuitem' }, 'item'), props: { teleport } })
      byId('menu-trigger').click()
      await settle()
      expect(document.querySelector<HTMLElement>('.menu-items')!.style.zIndex).toBe(layer)
      cleanups.splice(0).forEach(cleanup => cleanup())
    }
  })
})

/** 等待 flush:pre 的 watcher 与组件更新落地 */
async function settle() {
  await nextTick()
  await nextTick()
}

function byId(id: string): HTMLElement {
  const el = document.getElementById(id)
  if (!el) throw new Error(`element #${id} not found`)
  return el
}

/** 在当前焦点元素（默认）上派发 keydown，模拟真实浏览器的事件目标 */
function press(
  key: string,
  target: EventTarget | null = document.activeElement,
  init: KeyboardEventInit = {}
): KeyboardEvent {
  const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init })
  ;(target ?? document).dispatchEvent(event)
  return event
}

function mountMenu(config: {
  menu: (close: () => void) => VNodeChild
  props?: Record<string, unknown>
  triggerId?: string
  stopPropagation?: boolean
}): { open: Ref<boolean> } {
  const open = ref(false)

  const Comp = defineComponent({
    setup() {
      return () =>
        h(
          DropdownMenu,
          {
            modelValue: open.value,
            'onUpdate:modelValue': (value: boolean) => {
              open.value = value
            },
            ...config.props,
          },
          {
            trigger: ({ triggerProps }: TriggerSlotProps) =>
              h(
                UiButton,
                { ...triggerProps, variant: 'select', id: config.triggerId || 'menu-trigger' },
                { default: () => 'trigger' }
              ),
            menu: (slotProps: MenuSlotProps) => config.menu(slotProps.close),
          }
        )
    },
  })

  const container = document.createElement('div')
  if (config.stopPropagation) container.addEventListener('click', event => event.stopPropagation())
  document.body.appendChild(container)
  const app = createApp(Comp)
  app.mount(container)
  cleanups.push(() => {
    app.unmount()
    container.remove()
  })

  return { open }
}

/** 三个可导航项：两个 menuitemradio（ModelSelector 用法）+ 一个 menuitem */
function radioMenu(): VNodeChild {
  return [
    h('button', { id: 'item-fast', type: 'button', role: 'menuitemradio' }, 'fast'),
    h('button', { id: 'item-balanced', type: 'button', role: 'menuitemradio' }, 'balanced'),
    h('button', { id: 'item-model', type: 'button', role: 'menuitem' }, 'model'),
  ]
}

beforeEach(() => {
  document.body.innerHTML = ''
})

afterEach(async () => {
  while (cleanups.length > 0) cleanups.pop()?.()
  vi.unstubAllGlobals()
  await settle()
  document.body.innerHTML = ''
})

describe('DropdownMenu 键盘交互', () => {
  it('共用下拉按钮透传展开状态，关闭后恢复到同一个触发器', async () => {
    mountMenu({ menu: () => radioMenu(), props: { teleport: true } })
    const trigger = byId('menu-trigger')
    expect(trigger.classList.contains('ui-button-select')).toBe(true)
    expect(trigger.getAttribute('aria-expanded')).toBe('false')
    trigger.focus()
    press('Enter', trigger)
    trigger.click()
    await settle()
    expect(trigger.getAttribute('aria-expanded')).toBe('true')
    expect(document.activeElement).toBe(byId('item-fast'))
    press('Escape')
    await settle()
    expect(trigger.getAttribute('aria-expanded')).toBe('false')
    expect(document.activeElement).toBe(trigger)
  })

  it.each([false, true])('菜单互斥不受业务 click.stop 干扰，teleport=%s', async teleport => {
    const first = mountMenu({
      triggerId: 'first-trigger',
      menu: () => radioMenu(),
      props: { teleport },
    })
    const second = mountMenu({
      triggerId: 'second-trigger',
      stopPropagation: true,
      menu: () => h('button', { role: 'menuitem' }, 'second'),
      props: { teleport },
    })
    byId('first-trigger').click()
    await settle()
    byId('second-trigger').focus()
    byId('second-trigger').click()
    await settle()
    expect(first.open.value).toBe(false)
    expect(second.open.value).toBe(true)
    expect(document.activeElement).toBe(byId('second-trigger'))
    press('Escape')
    await settle()
    expect(second.open.value).toBe(false)
    byId('first-trigger').click()
    await settle()
    expect(first.open.value).toBe(true)
    expect(second.open.value).toBe(false)
  })
  it.each(['Enter', ' '])('用 %s 打开 menu 时把焦点移到首个菜单项', async key => {
    mountMenu({ menu: () => radioMenu() })
    const trigger = byId('menu-trigger')
    trigger.focus()

    press(key, trigger)
    trigger.click()
    await settle()

    expect(document.activeElement).toBe(byId('item-fast'))
  })

  it.each(['bottom-left', 'bottom-right', 'top-left', 'top-right'])(
    '把最终位置 %s 暴露给原点动效',
    async position => {
      const { open } = mountMenu({ menu: () => radioMenu(), props: { position } })
      open.value = true
      await settle()

      expect(document.querySelector<HTMLElement>('[role="menu"]')?.dataset.position).toBe(position)
    }
  )

  it('方向键可在 menuitemradio / menuitemcheckbox 项之间导航', async () => {
    const { open } = mountMenu({ menu: () => radioMenu() })
    open.value = true
    await settle()

    byId('menu-trigger').focus()

    const first = press('ArrowDown')
    expect(first.defaultPrevented).toBe(true)
    expect(document.activeElement).toBe(byId('item-fast'))

    press('ArrowDown')
    expect(document.activeElement).toBe(byId('item-balanced'))

    press('End')
    expect(document.activeElement).toBe(byId('item-model'))

    press('Home')
    expect(document.activeElement).toBe(byId('item-fast'))

    // 首项继续向上循环到末项
    press('ArrowUp')
    expect(document.activeElement).toBe(byId('item-model'))
  })

  it('dialog 模式保留复合控件的原生 Tab 与方向键语义', async () => {
    const { open } = mountMenu({
      menu: () => [
        h('button', { id: 'item-model', type: 'button' }, 'model'),
        h('input', { id: 'effort-slider', type: 'range', min: '0', max: '2', value: '1' }),
      ],
      props: { contentRole: 'dialog' },
    })
    open.value = true
    await settle()

    expect(document.querySelector('[role="dialog"]')).not.toBeNull()
    expect(byId('menu-trigger').getAttribute('aria-haspopup')).toBe('dialog')
    expect(document.activeElement).toBe(byId('item-model'))

    byId('effort-slider').focus()
    expect(document.activeElement).toBe(byId('effort-slider'))

    for (const key of ['ArrowDown', 'ArrowUp', 'ArrowLeft', 'ArrowRight', 'Home', 'End']) {
      expect(press(key).defaultPrevented).toBe(false)
      expect(document.activeElement).toBe(byId('effort-slider'))
    }

    expect(press('Tab').defaultPrevented).toBe(false)
    expect(open.value).toBe(true)
  })

  it.each(['top-left', 'bottom-left'] as const)(
    'Teleport %s 向上展开时固定底边，超出视口后仍钳制位置',
    async position => {
      let resizeCallback: ResizeObserverCallback | undefined
      let resizeObserver: ResizeObserver | undefined
      class ResizeObserverMock implements ResizeObserver {
        constructor(callback: ResizeObserverCallback) {
          resizeCallback = callback
          resizeObserver = this
        }
        observe() {}
        unobserve() {}
        disconnect() {}
      }
      vi.stubGlobal('ResizeObserver', ResizeObserverMock)
      vi.spyOn(window, 'innerHeight', 'get').mockReturnValue(600)
      vi.spyOn(window, 'innerWidth', 'get').mockReturnValue(800)

      const { open } = mountMenu({
        menu: () => h('button', { id: 'dialog-action', type: 'button' }, 'action'),
        props: { contentRole: 'dialog', teleport: true, position },
      })
      byId('menu-trigger').parentElement!.getBoundingClientRect = () =>
        ({ left: 100, right: 180, top: 500, bottom: 540, width: 80, height: 40 }) as DOMRect
      open.value = true
      await settle()

      const dialog = document.querySelector<HTMLElement>('[role="dialog"]')!
      Object.defineProperty(dialog, 'offsetWidth', { configurable: true, value: 200 })
      Object.defineProperty(dialog, 'offsetHeight', { configurable: true, value: 300 })
      resizeCallback?.([], resizeObserver!)
      await settle()

      expect(dialog.style.top).toBe('auto')
      expect(dialog.style.bottom).toBe('108px')
      expect(dialog.style.left).toBe('100px')
      Object.defineProperty(dialog, 'offsetHeight', { configurable: true, value: 400 })
      resizeCallback?.([], resizeObserver!)
      await settle()
      expect(dialog.style.bottom).toBe('108px')
      expect(dialog.style.top).toBe('auto')

      Object.defineProperty(dialog, 'offsetHeight', { configurable: true, value: 520 })
      resizeCallback?.([], resizeObserver!)
      await settle()
      expect(dialog.style.top).toBe('8px')
      expect(dialog.style.bottom).toBe('auto')
      expect(Number.parseFloat(dialog.style.top) + dialog.offsetHeight).toBeLessThanOrEqual(592)
    }
  )

  it('有足够下方空间时仍固定顶边，不启用底边锚定', async () => {
    vi.spyOn(window, 'innerHeight', 'get').mockReturnValue(600)
    const { open } = mountMenu({
      menu: () => h('button', { type: 'button' }, 'action'),
      props: { contentRole: 'dialog', teleport: true, position: 'bottom-left' },
    })
    byId('menu-trigger').parentElement!.getBoundingClientRect = () =>
      ({ left: 100, right: 180, top: 40, bottom: 80, width: 80, height: 40 }) as DOMRect
    open.value = true
    await settle()
    const dialog = document.querySelector<HTMLElement>('[role="dialog"]')!
    expect(dialog.style.top).toBe('88px')
    expect(dialog.style.bottom).toBe('auto')
  })

  it('跳过 disabled / aria-disabled 的菜单项', async () => {
    const { open } = mountMenu({
      menu: () => [
        h('button', { id: 'item-off', type: 'button', role: 'menuitemradio', disabled: '' }, 'off'),
        h(
          'button',
          { id: 'item-aria-off', type: 'button', role: 'menuitem', 'aria-disabled': 'true' },
          'aria-off'
        ),
        h('button', { id: 'item-ok', type: 'button', role: 'menuitemradio' }, 'ok'),
      ],
    })
    open.value = true
    await settle()

    byId('menu-trigger').focus()
    press('ArrowDown')
    expect(document.activeElement).toBe(byId('item-ok'))
  })

  it('菜单内没有任何可导航项时不 preventDefault（不吞掉页面滚动）', async () => {
    const { open } = mountMenu({
      menu: () => [h('div', { id: 'plain-content' }, '纯展示内容')],
    })
    open.value = true
    await settle()

    byId('menu-trigger').focus()
    const event = press('ArrowDown')
    expect(event.defaultPrevented).toBe(false)
    expect(document.activeElement).toBe(byId('menu-trigger'))
  })

  it('菜单打开但焦点在菜单/触发器之外时不劫持方向键', async () => {
    const { open } = mountMenu({ menu: () => radioMenu() })
    open.value = true
    await settle()

    const outside = document.createElement('button')
    outside.id = 'outside-control'
    document.body.appendChild(outside)
    outside.focus()

    const event = press('ArrowDown', outside)
    expect(event.defaultPrevented).toBe(false)
    expect(document.activeElement).toBe(outside)
  })

  it('菜单被业务强制常开、焦点落回 body 时不抢焦点也不吞按键', async () => {
    const { open } = mountMenu({ menu: () => radioMenu(), props: { closeOnEscape: false } })
    open.value = true
    await settle()

    // 用户点了页面正文，焦点退回 body（朗读播放期间「更多」菜单常开的场景）
    ;(document.activeElement as HTMLElement | null)?.blur()
    expect(document.activeElement).toBe(document.body)

    const event = press('ArrowDown', document.body)
    expect(event.defaultPrevented).toBe(false)
    expect(document.activeElement).toBe(document.body)

    const homeEvent = press('End', document.body)
    expect(homeEvent.defaultPrevented).toBe(false)
    expect(document.activeElement).toBe(document.body)
  })

  it('Enter / Space 为非原生元素的菜单项合成点击', async () => {
    const onSelect = vi.fn()
    const { open } = mountMenu({
      menu: () => [
        h(
          'div',
          { id: 'custom-item', role: 'menuitem', tabindex: '-1', onClick: onSelect },
          'custom'
        ),
      ],
    })
    open.value = true
    await settle()

    byId('menu-trigger').focus()
    press('ArrowDown')
    expect(document.activeElement).toBe(byId('custom-item'))

    const event = press('Enter')
    expect(event.defaultPrevented).toBe(true)
    expect(onSelect).toHaveBeenCalledTimes(1)
  })

  it('键盘选中菜单项后菜单关闭且焦点回到触发器', async () => {
    const { open } = mountMenu({
      menu: close => [
        h(
          'button',
          { id: 'item-select', type: 'button', role: 'menuitemradio', onClick: () => close() },
          'select'
        ),
      ],
    })
    open.value = true
    await settle()

    byId('menu-trigger').focus()
    press('ArrowDown')
    expect(document.activeElement).toBe(byId('item-select'))

    // 原生 button 上的 Enter 由浏览器派发 click
    byId('item-select').click()
    await settle()

    expect(open.value).toBe(false)
    expect(document.activeElement).toBe(byId('menu-trigger'))
  })

  it('Tab 收起菜单并把焦点交还触发器，不阻止默认的顺序移动', async () => {
    const { open } = mountMenu({ menu: () => radioMenu() })
    open.value = true
    await settle()

    byId('menu-trigger').focus()
    press('ArrowDown')
    expect(document.activeElement).toBe(byId('item-fast'))

    const event = press('Tab')
    expect(event.defaultPrevented).toBe(false)
    expect(document.activeElement).toBe(byId('menu-trigger'))
    await settle()
    expect(open.value).toBe(false)
  })

  it('菜单打开后焦点仍在触发器时，Tab 也会收起菜单', async () => {
    const { open } = mountMenu({ menu: () => radioMenu() })
    open.value = true
    await settle()

    byId('menu-trigger').focus()
    const event = press('Tab')
    expect(event.defaultPrevented).toBe(false)
    await settle()
    expect(open.value).toBe(false)
  })

  it('Esc 关闭菜单并归还焦点', async () => {
    const { open } = mountMenu({ menu: () => radioMenu() })
    open.value = true
    await settle()

    byId('menu-trigger').focus()
    press('ArrowDown')

    const event = press('Escape')
    expect(event.defaultPrevented).toBe(true)
    await settle()
    expect(open.value).toBe(false)
    expect(document.activeElement).toBe(byId('menu-trigger'))
  })

  it('closeOnEscape: false 时不消费 Esc', async () => {
    const { open } = mountMenu({ menu: () => radioMenu(), props: { closeOnEscape: false } })
    open.value = true
    await settle()

    byId('menu-trigger').focus()
    const event = press('Escape')
    expect(event.defaultPrevented).toBe(false)
    await settle()
    expect(open.value).toBe(true)
  })
})

describe('DropdownMenu 与外层弹窗协同', () => {
  function mountDialogWithMenu(menuProps: Record<string, unknown> = {}) {
    const visible = ref(true)
    const menuOpen = ref(false)
    const onClose = vi.fn(() => {
      visible.value = false
    })

    const Comp = defineComponent({
      setup() {
        const { setDialogRef, dialogAttrs } = useDialogA11y(visible, { onClose })
        return () =>
          visible.value
            ? h('div', { ref: setDialogRef, ...dialogAttrs, id: 'dialog-root' }, [
                h('button', { id: 'dialog-close', type: 'button' }, 'close'),
                h(
                  DropdownMenu,
                  {
                    modelValue: menuOpen.value,
                    'onUpdate:modelValue': (value: boolean) => {
                      menuOpen.value = value
                    },
                    teleport: true,
                    ...menuProps,
                  },
                  {
                    trigger: () => h('button', { id: 'menu-trigger', type: 'button' }, 'trigger'),
                    menu: () => [
                      h('button', { id: 'item-a', type: 'button', role: 'menuitemradio' }, 'a'),
                      h('button', { id: 'item-b', type: 'button', role: 'menuitemradio' }, 'b'),
                    ],
                  }
                ),
                h('button', { id: 'dialog-tail', type: 'button' }, 'tail'),
              ])
            : null
      },
    })

    const container = document.createElement('div')
    document.body.appendChild(container)
    const app = createApp(Comp)
    app.mount(container)
    cleanups.push(() => {
      app.unmount()
      container.remove()
    })

    return { visible, menuOpen, onClose }
  }

  it('弹窗内打开下拉：Esc 只关菜单，再按一次才关弹窗', async () => {
    const { menuOpen, onClose, visible } = mountDialogWithMenu()
    await settle()

    // 鼠标点击触发器展开菜单：焦点仍留在弹窗内的触发按钮上
    byId('menu-trigger').focus()
    menuOpen.value = true
    await settle()

    const firstEsc = press('Escape')
    await settle()
    expect(firstEsc.defaultPrevented).toBe(true)
    expect(menuOpen.value).toBe(false)
    expect(onClose).not.toHaveBeenCalled()
    expect(visible.value).toBe(true)

    const secondEsc = press('Escape')
    await settle()
    expect(secondEsc.defaultPrevented).toBe(true)
    expect(onClose).toHaveBeenCalledTimes(1)
    expect(visible.value).toBe(false)
  })

  it('焦点已移入 Teleport 菜单时按 Esc 同样只关菜单', async () => {
    const { menuOpen, onClose } = mountDialogWithMenu()
    await settle()

    byId('menu-trigger').focus()
    menuOpen.value = true
    await settle()

    press('ArrowDown')
    expect(document.activeElement).toBe(byId('item-a'))

    press('Escape')
    await settle()
    expect(menuOpen.value).toBe(false)
    expect(onClose).not.toHaveBeenCalled()
    expect(document.activeElement).toBe(byId('menu-trigger'))
  })

  it('菜单关闭后 Esc 正常关闭弹窗（不残留浮层登记）', async () => {
    const { menuOpen, onClose } = mountDialogWithMenu()
    await settle()

    byId('menu-trigger').focus()
    menuOpen.value = true
    await settle()
    menuOpen.value = false
    await settle()

    press('Escape')
    await settle()
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('closeOnEscape: false 的下拉不吞 Esc，弹窗照常关闭', async () => {
    const { menuOpen, onClose } = mountDialogWithMenu({ closeOnEscape: false })
    await settle()

    byId('menu-trigger').focus()
    menuOpen.value = true
    await settle()

    press('Escape')
    await settle()
    expect(menuOpen.value).toBe(true)
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('焦点在 Teleport 菜单内时 Tab 不被弹窗焦点陷阱拉回，而是收起菜单回到触发器', async () => {
    const { menuOpen } = mountDialogWithMenu()
    await settle()

    byId('menu-trigger').focus()
    menuOpen.value = true
    await settle()

    press('ArrowDown')
    expect(document.activeElement).toBe(byId('item-a'))

    const event = press('Tab')
    await settle()
    // 菜单收起、焦点回到弹窗内的触发器，且事件未被焦点陷阱拦截
    // （真实浏览器会从触发器继续走原生 Tab 顺序，而不是被拉回弹窗首个元素）
    expect(menuOpen.value).toBe(false)
    expect(document.activeElement).toBe(byId('menu-trigger'))
    expect(event.defaultPrevented).toBe(false)
  })
})
