import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import { defineComponent, h, nextTick } from 'vue'
import { useScroll, type ScrollReturn } from './useScroll'

/** 用可控几何模拟滚动容器：happy-dom 不做布局 */
function mountScroller(onReaderDetach = vi.fn()) {
  let api!: ScrollReturn
  const Host = defineComponent({
    setup() {
      api = useScroll({ onReaderDetach })
      return () => h('div', { ref: api.scrollRef })
    },
  })
  const wrapper = mount(Host)
  const element = wrapper.element as HTMLDivElement
  const geometry = { scrollHeight: 1000, clientHeight: 400, scrollTop: 0 }
  Object.defineProperty(element, 'scrollHeight', {
    configurable: true,
    get: () => geometry.scrollHeight,
  })
  Object.defineProperty(element, 'clientHeight', {
    configurable: true,
    get: () => geometry.clientHeight,
  })
  Object.defineProperty(element, 'scrollTop', {
    configurable: true,
    get: () => geometry.scrollTop,
    set: (value: number) => {
      const floor = Math.max(0, geometry.scrollHeight - geometry.clientHeight)
      geometry.scrollTop = Math.max(0, Math.min(value, floor))
    },
  })
  return { wrapper, api, geometry, element, onReaderDetach }
}

describe('useScroll 观察账本与底部归属', () => {
  it('程序跟随写到底部并保持归属，送达的相同位置不算读者输入', async () => {
    const { api, geometry, onReaderDetach } = mountScroller()
    await nextTick()
    api.followIfPinned()
    expect(geometry.scrollTop).toBe(600)
    api.handleScroll()
    expect(onReaderDetach).not.toHaveBeenCalled()
    expect(api.isAtBottom.value).toBe(true)

    geometry.scrollHeight = 1300
    api.followIfPinned()
    expect(geometry.scrollTop).toBe(900)
  })

  it('读者移开视口即释放跟随并回调；之后内容长高不再拽回', async () => {
    const { api, geometry, onReaderDetach } = mountScroller()
    await nextTick()
    api.followIfPinned()

    geometry.scrollTop = 300
    api.handleScroll()
    expect(onReaderDetach).toHaveBeenCalledTimes(1)
    expect(api.isAtBottom.value).toBe(false)

    geometry.scrollHeight = 1400
    api.followIfPinned()
    expect(geometry.scrollTop).toBe(300)
    api.handleScroll()
    expect(onReaderDetach).toHaveBeenCalledTimes(1)
  })

  it('读者回到底部 24px 内重新钉底，此后继续跟随', async () => {
    const { api, geometry } = mountScroller()
    await nextTick()
    geometry.scrollTop = 200
    api.handleScroll()
    geometry.scrollTop = 590
    api.handleScroll()

    geometry.scrollHeight = 1200
    api.followIfPinned()
    expect(geometry.scrollTop).toBe(800)
  })

  it('未钉底时不跟随，但刷新 isAtBottom 供「回到底部」按钮使用', async () => {
    const { api, geometry } = mountScroller()
    await nextTick()
    geometry.scrollTop = 300
    api.handleScroll()
    expect(api.isAtBottom.value).toBe(false)

    geometry.scrollHeight = 1400
    api.followIfPinned()
    expect(geometry.scrollTop).toBe(300)

    geometry.scrollTop = 900
    api.handleScroll()
    geometry.scrollHeight = 1500
    api.followIfPinned()
    expect(geometry.scrollTop).toBe(900)
    expect(api.isAtBottom.value).toBe(true)
  })

  it('账本外的程序滚动把视口送到底部（会话切换钉底 / 钳位）时重新接管跟随', async () => {
    const { api, geometry, onReaderDetach } = mountScroller()
    await nextTick()
    geometry.scrollTop = 300
    api.handleScroll()
    expect(onReaderDetach).toHaveBeenCalledTimes(1)

    // 切到更矮的会话：浏览器把 scrollTop 钳到新的底部，事件位置等于 min(账本, 底部)
    geometry.scrollHeight = 650
    geometry.scrollTop = 250
    api.handleScroll()
    expect(onReaderDetach).toHaveBeenCalledTimes(1)

    geometry.scrollHeight = 1000
    api.followIfPinned()
    expect(geometry.scrollTop).toBe(600)
  })

  it('recordProgrammaticScroll 按落点几何设定归属，不触发读者回调', async () => {
    const { api, geometry, onReaderDetach } = mountScroller()
    await nextTick()
    api.followIfPinned()

    geometry.scrollTop = 100
    api.recordProgrammaticScroll()
    api.handleScroll()
    expect(onReaderDetach).not.toHaveBeenCalled()
    geometry.scrollHeight = 1200
    api.followIfPinned()
    expect(geometry.scrollTop).toBe(100)

    geometry.scrollTop = 790
    api.recordProgrammaticScroll()
    geometry.scrollHeight = 1400
    api.followIfPinned()
    expect(geometry.scrollTop).toBe(1000)
  })

  it('pinToBottomNow 同步钉底并接管跟随', async () => {
    const { api, geometry } = mountScroller()
    await nextTick()
    geometry.scrollTop = 100
    api.handleScroll()
    api.pinToBottomNow()
    expect(geometry.scrollTop).toBe(600)
    geometry.scrollHeight = 1200
    api.followIfPinned()
    expect(geometry.scrollTop).toBe(800)
  })

  it('内容收缩后的浏览器钳位不改变归属，下一次长高仍跟随', async () => {
    const { api, geometry, onReaderDetach } = mountScroller()
    await nextTick()
    api.followIfPinned()
    expect(geometry.scrollTop).toBe(600)

    geometry.scrollHeight = 900
    geometry.scrollTop = 500
    api.handleScroll()
    expect(onReaderDetach).not.toHaveBeenCalled()

    geometry.scrollHeight = 1300
    api.followIfPinned()
    expect(geometry.scrollTop).toBe(900)
  })

  it('adjustScrollTopBy 是程序补偿：记账且不改变归属', async () => {
    const { api, geometry, onReaderDetach } = mountScroller()
    await nextTick()
    geometry.scrollTop = 300
    api.handleScroll()
    expect(onReaderDetach).toHaveBeenCalledTimes(1)

    api.adjustScrollTopBy(200)
    expect(geometry.scrollTop).toBe(500)
    api.handleScroll()
    expect(onReaderDetach).toHaveBeenCalledTimes(1)
    geometry.scrollHeight = 1500
    api.followIfPinned()
    expect(geometry.scrollTop).toBe(500)
  })

  it('scrollToBottom 显式接管跟随', async () => {
    const { api, geometry } = mountScroller()
    await nextTick()
    geometry.scrollTop = 100
    api.handleScroll()
    await api.scrollToBottom()
    expect(geometry.scrollTop).toBe(600)
    geometry.scrollHeight = 1200
    api.followIfPinned()
    expect(geometry.scrollTop).toBe(800)
  })
})
