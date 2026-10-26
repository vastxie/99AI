import { mount, type VueWrapper } from '@vue/test-utils'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import { computedStyle, installStylesheet, readStyle, rootVar } from '@/styles/stylesheet.testkit'
import PanelSwitcher from './PanelSwitcher.vue'

let wrapper: VueWrapper | undefined
let heights = [80, 156]
let frames: Map<number, FrameRequestCallback>
let resize: () => void
let reduceMotion = false
let removeStyles: () => void
const disconnect = vi.fn()
const observe = vi.fn()
const animate = vi.fn()
const nativeAnimate = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'animate')

beforeAll(() => {
  removeStyles = installStylesheet(
    ['src/styles/tokens.css', 'src/styles/motion.css'].map(readStyle).join('\n')
  )
})

afterAll(() => {
  removeStyles()
})

beforeEach(() => {
  heights = [80, 156]
  reduceMotion = false
  frames = new Map()
  let frameId = 0
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    frames.set(++frameId, callback)
    return frameId
  })
  vi.stubGlobal('cancelAnimationFrame', (id: number) => frames.delete(id))
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe = observe
      disconnect = disconnect
      constructor(callback: ResizeObserverCallback) {
        resize = () => callback([], this as unknown as ResizeObserver)
      }
    }
  )
  vi.spyOn(window, 'matchMedia').mockImplementation(
    query =>
      ({
        matches: reduceMotion && query.includes('prefers-reduced-motion'),
        media: query,
        addEventListener() {},
        removeEventListener() {},
      }) as unknown as MediaQueryList
  )
  Object.defineProperty(HTMLElement.prototype, 'animate', {
    configurable: true,
    writable: true,
    value: animate,
  })
  vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockImplementation(function (
    this: HTMLElement
  ) {
    if (!this.classList.contains('panel-switcher__content')) return 0
    return heights[Number(this.parentElement?.dataset.page) - 1]
  })
})

afterEach(() => {
  wrapper?.unmount()
  wrapper = undefined
  document.body.innerHTML = ''
  if (nativeAnimate) Object.defineProperty(HTMLElement.prototype, 'animate', nativeAnimate)
  else Reflect.deleteProperty(HTMLElement.prototype, 'animate')
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  vi.clearAllMocks()
})

async function mountPanel(active = true) {
  wrapper = mount(PanelSwitcher, {
    props: { page: 1, active },
    slots: { first: '<button>First</button>', second: '<button>Second</button>' },
    attachTo: document.body,
  })
  await nextTick()
  return wrapper
}

/** 执行等待中的下一帧回调 */
async function nextFrame() {
  const callbacks = [...frames.values()]
  frames.clear()
  callbacks.forEach(callback => callback(0))
  await nextTick()
}

/** 某个元素收到的动画关键帧 */
function keyframesOn(element: Element) {
  return animate.mock.calls
    .filter((_, index) => animate.mock.contexts[index] === element)
    .map(([keyframes]) => keyframes)
}

describe('PanelSwitcher 两页面板', () => {
  it('首次显示直接按当前页内容定高，下一帧之后的高度变化才播放动画', async () => {
    const panel = await mountPanel()
    expect(panel.attributes('style')).toContain('height: 80px')
    heights = [120, 156]
    resize()
    await nextTick()
    expect(panel.attributes('style')).toContain('height: 120px')
    expect(animate).not.toHaveBeenCalled()
    await nextFrame()
    heights = [90, 156]
    resize()
    await nextTick()
    expect(panel.attributes('style')).toContain('height: 90px')
    expect(keyframesOn(panel.element)).toEqual([[{ height: '120px' }, { height: '90px' }]])
    expect(animate.mock.calls[0][1]).toEqual({
      duration: parseFloat(rootVar('--motion-duration-lg')),
      easing: rootVar('--motion-easing'),
    })
    expect(observe).toHaveBeenCalledTimes(2)
  })

  it('换页：两页常驻、只有当前页可见可交互，两页反向错开淡入淡出，外框高度跟着过渡', async () => {
    const panel = await mountPanel()
    await nextFrame()
    const [first, second] = panel.findAll('.panel-switcher__page').map(page => page.element)
    await panel.setProps({ page: 2 })
    expect(panel.attributes('style')).toContain('height: 156px')
    expect(panel.attributes('data-current-page')).toBe('2')
    expect(first.getAttribute('inert')).not.toBeNull()
    expect(first.getAttribute('aria-hidden')).toBe('true')
    expect(second.getAttribute('inert')).toBeNull()
    expect(second.getAttribute('aria-hidden')).toBe('false')
    expect(computedStyle(first).visibility).toBe('hidden')
    expect(computedStyle(second).visibility).not.toBe('hidden')
    expect(keyframesOn(panel.element)).toEqual([[{ height: '80px' }, { height: '156px' }]])
    expect(keyframesOn(first)).toEqual([
      [
        { opacity: 1, visibility: 'visible', transform: 'none' },
        { opacity: 0, visibility: 'visible', transform: 'translateX(-6px)' },
      ],
    ])
    expect(keyframesOn(second)).toEqual([
      [
        { opacity: 0, transform: 'translateX(6px)' },
        { opacity: 1, transform: 'none' },
      ],
    ])
    await panel.setProps({ page: 1 })
    expect(panel.attributes('style')).toContain('height: 80px')
    expect(keyframesOn(second).at(-1)?.[1]).toEqual({
      opacity: 0,
      visibility: 'visible',
      transform: 'translateX(6px)',
    })
    expect(panel.findAll('.panel-switcher__page').map(page => page.element)).toEqual([
      first,
      second,
    ])
  })

  it('关闭时保持当前页与高度供父层淡出，重新打开直接到位', async () => {
    const panel = await mountPanel()
    await nextFrame()
    await panel.setProps({ page: 2 })
    animate.mockClear()
    await panel.setProps({ active: false })
    expect(panel.attributes('style')).toContain('height: 156px')
    expect(panel.get('[data-page="2"]').attributes('data-current')).toBe('true')
    expect(panel.findAll('.panel-switcher__page[inert]')).toHaveLength(2)
    await panel.setProps({ active: true, page: 1 })
    expect(panel.attributes('style')).toContain('height: 80px')
    await nextFrame()
    expect(animate).not.toHaveBeenCalled()
  })

  it('只读取当前页的自然高度，量不到（祖先隐藏、尚未布局）时保持原高度', async () => {
    const panel = await mountPanel()
    await nextFrame()
    heights = [104, 240]
    resize()
    await nextTick()
    expect(panel.attributes('style')).toContain('height: 104px')
    await panel.setProps({ page: 2 })
    expect(panel.attributes('style')).toContain('height: 240px')
    heights[1] = 0
    resize()
    await nextTick()
    expect(panel.attributes('style')).toContain('height: 240px')
  })

  it('上一段动画还在播放时换页：先取消它，新的一段从当前画面接着播放', async () => {
    const panel = await mountPanel()
    await nextFrame()
    await panel.setProps({ page: 2 })
    const cancel = vi.fn()
    Object.defineProperty(HTMLElement.prototype, 'getAnimations', {
      configurable: true,
      value: () => [{ cancel, finished: Promise.resolve() }],
    })
    try {
      await panel.setProps({ page: 1 })
      // 外框与两页各有一段在播放的动画
      expect(cancel).toHaveBeenCalledTimes(3)
      expect(keyframesOn(panel.element).at(-1)?.[1]).toEqual({ height: '80px' })
    } finally {
      Reflect.deleteProperty(HTMLElement.prototype, 'getAnimations')
    }
  })

  it('减弱动态效果时不播放动画，高度与页面直接到位', async () => {
    reduceMotion = true
    const panel = await mountPanel()
    await nextFrame()
    await panel.setProps({ page: 2 })
    expect(panel.attributes('style')).toContain('height: 156px')
    expect(animate).not.toHaveBeenCalled()
  })

  it('关闭和卸载时清理待执行的帧与尺寸观察', async () => {
    const panel = await mountPanel()
    expect(frames.size).toBe(1)
    await panel.setProps({ active: false })
    expect(frames.size).toBe(0)
    await panel.setProps({ active: true })
    expect(frames.size).toBe(1)
    panel.unmount()
    wrapper = undefined
    expect(frames.size).toBe(0)
    expect(disconnect).toHaveBeenCalledOnce()
  })
})
