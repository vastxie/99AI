import { mount, type VueWrapper } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import type { DialogOptions } from '@/utils/dialog'
import Confirm from './Confirm.vue'

vi.mock('@/locales', () => ({ t: (key: string) => key, tp: (key: string) => key }))

let wrapper: VueWrapper | undefined

afterEach(() => {
  wrapper?.unmount()
  wrapper = undefined
})

function mountConfirm() {
  wrapper = mount(Confirm, {
    attachTo: document.body,
    global: { stubs: { transition: false } },
  })
  return wrapper.vm as unknown as { showDialog: (options: DialogOptions) => Promise<boolean> }
}

function buttons() {
  return wrapper!.findAll('button')
}

describe('Confirm', () => {
  it('每次打开都从默认值开始：上一次的确认回调与按钮文案不会带进下一次弹窗', async () => {
    const dialog = mountConfirm()
    const logOut = vi.fn()

    const first = dialog.showDialog({
      title: '退出登录',
      content: '确定退出？',
      positiveText: '是',
      negativeText: '否',
      onPositiveClick: logOut,
    })
    await nextTick()
    await buttons()[0].trigger('click')
    await expect(first).resolves.toBe(false)

    const second = dialog.showDialog({ title: '删除会话', content: '确定删除？' })
    await nextTick()
    expect(buttons().map(button => button.text())).toEqual(['common.cancel', 'common.confirm'])
    await buttons()[1].trigger('click')
    await expect(second).resolves.toBe(true)
    expect(logOut).not.toHaveBeenCalled()
  })

  it('确认回调执行期间重复点击只执行一次，完成后关闭并返回 true', async () => {
    const dialog = mountConfirm()
    let finish!: () => void
    const onPositiveClick = vi.fn(
      () =>
        new Promise<void>(resolve => {
          finish = resolve
        })
    )

    const result = dialog.showDialog({ title: '删除消息', content: '确定删除？', onPositiveClick })
    await nextTick()
    const confirm = buttons()[1]
    await confirm.trigger('click')
    await confirm.trigger('click')
    expect(onPositiveClick).toHaveBeenCalledTimes(1)

    finish()
    await expect(result).resolves.toBe(true)
  })

  it('确认成功后关闭动画期间再点确认，不会把动作再执行一次', async () => {
    const dialog = mountConfirm()
    const onPositiveClick = vi.fn()
    const result = dialog.showDialog({ title: '删除消息', content: '确定删除？', onPositiveClick })
    await nextTick()
    const confirm = buttons()[1]
    await confirm.trigger('click')
    await expect(result).resolves.toBe(true)
    expect(confirm.element.isConnected).toBe(true)
    await confirm.trigger('click')
    expect(onPositiveClick).toHaveBeenCalledTimes(1)
  })
})

describe('Confirm 确认执行中', () => {
  it('确认回调执行期间两个按钮都禁用、Esc 不关闭；回调完成后关闭并返回 true', async () => {
    const dialog = mountConfirm()
    let finish!: () => void
    const result = dialog.showDialog({
      title: '删除消息',
      content: '确定删除？',
      onPositiveClick: () =>
        new Promise<void>(resolve => {
          finish = resolve
        }),
    })
    await nextTick()
    await buttons()[1].trigger('click')
    expect(buttons().map(button => button.attributes('disabled'))).toEqual(['', ''])
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    await nextTick()
    expect(wrapper!.find('[role="dialog"], .dialog-surface').exists()).toBe(true)
    finish()
    await expect(result).resolves.toBe(true)
  })

  it('确认回调失败：返回 false，弹窗留着，按钮恢复可用', async () => {
    const dialog = mountConfirm()
    const result = dialog.showDialog({
      title: '删除消息',
      content: '确定删除？',
      onPositiveClick: () => Promise.reject(new Error('network')),
    })
    await nextTick()
    await buttons()[1].trigger('click')
    await expect(result).resolves.toBe(false)
    await nextTick()
    expect(wrapper!.find('.dialog-surface').exists()).toBe(true)
    expect(buttons().map(button => button.attributes('disabled'))).toEqual([undefined, undefined])
  })

  it('确认回调失败后焦点回到确认按钮，键盘可以直接重试', async () => {
    const dialog = mountConfirm()
    let fail!: (error: Error) => void
    const result = dialog.showDialog({
      title: '删除消息',
      content: '确定删除？',
      onPositiveClick: () =>
        new Promise<void>((_, reject) => {
          fail = reject
        }),
    })
    // 等弹窗打开时的初始聚焦完成
    await nextTick()
    await nextTick()
    const confirm = buttons()[1].element as HTMLButtonElement
    confirm.focus()
    confirm.click()
    // 浏览器在按钮变为不可用时把焦点丢到 body 上；happy-dom 不模拟这一点，在按钮更新前手动失焦
    confirm.blur()
    await nextTick()
    expect(confirm.disabled).toBe(true)
    expect(document.activeElement).toBe(document.body)
    fail(new Error('network'))
    await expect(result).resolves.toBe(false)
    await nextTick()
    await nextTick()
    expect(document.activeElement).toBe(confirm)
  })

  it('确认回调还没返回就被新弹窗顶替：新弹窗不受影响，上一个按回调的实际结果结束', async () => {
    const dialog = mountConfirm()
    let finish!: () => void
    const first = dialog.showDialog({
      title: '删除消息',
      content: '确定删除？',
      onPositiveClick: () =>
        new Promise<void>(resolve => {
          finish = resolve
        }),
    })
    await nextTick()
    await buttons()[1].trigger('click')
    const second = dialog.showDialog({ title: '删除会话', content: '确定删除？' })
    await nextTick()
    expect(buttons().map(button => button.attributes('disabled'))).toEqual([undefined, undefined])
    finish()
    await expect(first).resolves.toBe(true)
    await nextTick()
    expect(wrapper!.text()).toContain('删除会话')
    let settled = false
    void second.then(() => {
      settled = true
    })
    await nextTick()
    expect(settled).toBe(false)
    await buttons()[0].trigger('click')
    await expect(second).resolves.toBe(false)
  })

  it('危险操作（tone: danger）的确认按钮用危险色，默认仍是主色', async () => {
    const dialog = mountConfirm()
    void dialog.showDialog({ title: '删除会话', content: '确定删除？', tone: 'danger' })
    await nextTick()
    expect(buttons()[1].classes()).toContain('btn-danger')

    void dialog.showDialog({ title: '提示', content: '请先登录' })
    await nextTick()
    expect(buttons()[1].classes()).toContain('btn-primary')
  })
})
