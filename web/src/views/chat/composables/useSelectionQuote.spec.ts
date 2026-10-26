import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, nextTick, ref } from 'vue'
import { useChatStore } from '@/store/modules/chat'
import { useSelectionQuote } from './useSelectionQuote'

describe('useSelectionQuote dynamic input guard', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.useRealTimers()
    document.body.replaceChildren()
  })

  it('hides an eligible selection when input is disabled and rejects stale quote commit', async () => {
    const host = document.createElement('div')
    const textNode = document.createTextNode('selected text')
    host.append(textNode)
    document.body.append(host)
    vi.spyOn(host, 'getBoundingClientRect').mockReturnValue({
      bottom: 300,
      height: 300,
      left: 0,
      right: 500,
      top: 0,
      width: 500,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    })

    const removeAllRanges = vi.fn()
    vi.spyOn(window, 'getSelection').mockReturnValue({
      anchorNode: textNode,
      focusNode: textNode,
      getRangeAt: () => ({
        getBoundingClientRect: () => ({
          bottom: 140,
          height: 20,
          left: 100,
          right: 220,
          top: 120,
          width: 120,
          x: 100,
          y: 120,
          toJSON: () => ({}),
        }),
        getClientRects: () => [],
      }),
      isCollapsed: false,
      rangeCount: 1,
      removeAllRanges,
      toString: () => 'selected text',
    } as unknown as Selection)

    const enabled = ref(true)
    let quote!: ReturnType<typeof useSelectionQuote>
    const wrapper = mount(
      defineComponent({
        setup() {
          quote = useSelectionQuote({
            hostRef: ref(host),
            isEligibleNode: node => host.contains(node),
            isEnabled: () => enabled.value,
          })
          return () => null
        },
      })
    )

    quote.handleSelectionChange()
    vi.runAllTimers()
    expect(quote.popover.value.visible).toBe(true)

    enabled.value = false
    await nextTick()
    expect(quote.popover.value.visible).toBe(false)

    quote.popover.value = {
      visible: true,
      text: 'stale selection',
      left: 0,
      top: 0,
      placement: 'above',
      truncated: false,
    }
    quote.quoteSelection()

    expect(useChatStore().activeQuote).toBeNull()
    expect(quote.popover.value.visible).toBe(false)
    expect(removeAllRanges).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it('触屏长按选词：选区稳定后出气泡，放在选区下方', async () => {
    const host = document.createElement('div')
    const textNode = document.createTextNode('selected text')
    host.append(textNode)
    document.body.append(host)
    vi.spyOn(host, 'getBoundingClientRect').mockReturnValue({
      bottom: 300,
      height: 300,
      left: 0,
      right: 500,
      top: 0,
      width: 500,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    })
    vi.spyOn(window, 'getSelection').mockReturnValue({
      anchorNode: textNode,
      focusNode: textNode,
      getRangeAt: () => ({
        getBoundingClientRect: () => ({
          bottom: 140,
          height: 20,
          left: 100,
          right: 220,
          top: 120,
          width: 120,
          x: 100,
          y: 120,
          toJSON: () => ({}),
        }),
        getClientRects: () => [],
      }),
      isCollapsed: false,
      rangeCount: 1,
      removeAllRanges: vi.fn(),
      toString: () => 'selected text',
    } as unknown as Selection)

    let quote!: ReturnType<typeof useSelectionQuote>
    const wrapper = mount(
      defineComponent({
        setup() {
          quote = useSelectionQuote({
            hostRef: ref(host),
            isEligibleNode: node => host.contains(node),
          })
          return () => null
        },
      })
    )
    await nextTick()

    document.dispatchEvent(new PointerEvent('pointerdown', { pointerType: 'touch' }))
    document.dispatchEvent(new Event('selectionchange'))
    vi.advanceTimersByTime(299)
    expect(quote.popover.value.visible).toBe(false)
    vi.advanceTimersByTime(1)
    expect(quote.popover.value).toMatchObject({ visible: true, placement: 'below', top: 148 })
    wrapper.unmount()
  })

  it('触屏选区贴着区域底部时气泡改放上方；选区被点掉就立刻收起，不再等', async () => {
    const host = document.createElement('div')
    const textNode = document.createTextNode('selected text')
    host.append(textNode)
    document.body.append(host)
    vi.spyOn(host, 'getBoundingClientRect').mockReturnValue({
      bottom: 300,
      height: 300,
      left: 0,
      right: 500,
      top: 0,
      width: 500,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    })
    const selection = { isCollapsed: false }
    vi.spyOn(window, 'getSelection').mockImplementation(
      () =>
        ({
          anchorNode: textNode,
          focusNode: textNode,
          getRangeAt: () => ({
            getBoundingClientRect: () => ({
              bottom: 280,
              height: 20,
              left: 100,
              right: 220,
              top: 260,
              width: 120,
              x: 100,
              y: 260,
              toJSON: () => ({}),
            }),
            getClientRects: () => [],
          }),
          get isCollapsed() {
            return selection.isCollapsed
          },
          rangeCount: 1,
          removeAllRanges: vi.fn(),
          toString: () => 'selected text',
        }) as unknown as Selection
    )

    let quote!: ReturnType<typeof useSelectionQuote>
    const wrapper = mount(
      defineComponent({
        setup() {
          quote = useSelectionQuote({
            hostRef: ref(host),
            isEligibleNode: node => host.contains(node),
          })
          return () => null
        },
      })
    )
    await nextTick()

    document.dispatchEvent(new PointerEvent('pointerdown', { pointerType: 'touch' }))
    document.dispatchEvent(new Event('selectionchange'))
    vi.advanceTimersByTime(300)
    expect(quote.popover.value).toMatchObject({ visible: true, placement: 'above', top: 252 })

    selection.isCollapsed = true
    document.dispatchEvent(new Event('selectionchange'))
    expect(quote.popover.value.visible).toBe(false)
    wrapper.unmount()
  })

  it('触屏选区贴着底下压着的输入区：按可见区域判断，气泡改放上方', async () => {
    const host = document.createElement('div')
    const textNode = document.createTextNode('selected text')
    host.append(textNode)
    document.body.append(host)
    vi.spyOn(host, 'getBoundingClientRect').mockReturnValue({
      bottom: 300,
      height: 300,
      left: 0,
      right: 500,
      top: 0,
      width: 500,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    })
    vi.spyOn(window, 'getSelection').mockReturnValue({
      anchorNode: textNode,
      focusNode: textNode,
      getRangeAt: () => ({
        getBoundingClientRect: () => ({
          bottom: 180,
          height: 20,
          left: 100,
          right: 220,
          top: 160,
          width: 120,
          x: 100,
          y: 160,
          toJSON: () => ({}),
        }),
        getClientRects: () => [],
      }),
      isCollapsed: false,
      rangeCount: 1,
      removeAllRanges: vi.fn(),
      toString: () => 'selected text',
    } as unknown as Selection)

    const inset = ref(0)
    let quote!: ReturnType<typeof useSelectionQuote>
    const wrapper = mount(
      defineComponent({
        setup() {
          quote = useSelectionQuote({
            hostRef: ref(host),
            isEligibleNode: node => host.contains(node),
            bottomInset: () => inset.value,
          })
          return () => null
        },
      })
    )
    await nextTick()

    document.dispatchEvent(new PointerEvent('pointerdown', { pointerType: 'touch' }))
    document.dispatchEvent(new Event('selectionchange'))
    vi.advanceTimersByTime(300)
    expect(quote.popover.value).toMatchObject({ visible: true, placement: 'below', top: 188 })

    // 底下 100px 被输入区盖住：选区下方只剩 12px 可见
    inset.value = 100
    document.dispatchEvent(new Event('selectionchange'))
    vi.advanceTimersByTime(300)
    expect(quote.popover.value).toMatchObject({ visible: true, placement: 'above', top: 152 })
    wrapper.unmount()
  })
})
