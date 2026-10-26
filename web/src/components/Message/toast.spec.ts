import { mount, type VueWrapper } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import Toast from './index.vue'

let wrapper: VueWrapper | undefined

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  wrapper?.unmount()
  wrapper = undefined
  vi.useRealTimers()
})

function mountToast() {
  wrapper = mount(Toast, { attachTo: document.body, global: { stubs: { transition: false } } })
  return wrapper.vm as unknown as {
    show: (options: { type?: 'success' | 'error' | 'warning' | 'info'; content: string }) => void
  }
}

const items = () => Array.from(document.querySelectorAll('.toast-item'))

describe('全局提示', () => {
  it('多条提示纵向排列：放在常驻的礼貌播报区里，错误另用 alert 立即播报', async () => {
    const toast = mountToast()
    toast.show({ type: 'success', content: '已保存' })
    toast.show({ type: 'error', content: '保存失败：网络异常' })
    await nextTick()
    expect(items().map(item => item.getAttribute('role'))).toEqual([null, 'alert'])
    const region = document.querySelector('.toast-region')
    expect(region?.getAttribute('role')).toBe('region')
    expect(region?.children).toHaveLength(1)
    expect(region?.firstElementChild?.getAttribute('aria-live')).toBe('polite')
  })

  it('同类型同内容的提示合并成一条并重新计时（请求层与调用方各弹一次时不再重影）', async () => {
    const toast = mountToast()
    toast.show({ type: 'error', content: '服务繁忙' })
    await vi.advanceTimersByTimeAsync(4000)
    toast.show({ type: 'error', content: '服务繁忙' })
    await nextTick()
    expect(items()).toHaveLength(1)
    // 重新计时：从第二次出现起再过 4 秒仍在
    await vi.advanceTimersByTimeAsync(4000)
    expect(items()).toHaveLength(1)
    await vi.advanceTimersByTimeAsync(1100)
    expect(items()).toHaveLength(0)
  })

  it('悬停时暂停计时，可以手动关闭；最多同时显示 3 条', async () => {
    const toast = mountToast()
    toast.show({ type: 'info', content: 'a' })
    await nextTick()
    items()[0].dispatchEvent(new MouseEvent('mouseenter'))
    await vi.advanceTimersByTimeAsync(10_000)
    expect(items()).toHaveLength(1)
    ;(items()[0].querySelector('.toast-close') as HTMLButtonElement).click()
    await nextTick()
    expect(items()).toHaveLength(0)

    for (const content of ['1', '2', '3', '4']) toast.show({ content })
    await nextTick()
    expect(items().map(item => item.querySelector('.toast-text')?.textContent)).toEqual([
      '2',
      '3',
      '4',
    ])
  })
})
