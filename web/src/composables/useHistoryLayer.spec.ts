import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, nextTick, ref, type Ref } from 'vue'
import {
  closeHistoryLayers,
  historyBack,
  runInHistoryQueue,
  useHistoryLayer,
  whenHistorySettled,
} from './useHistoryLayer'

/**
 * 模拟浏览器会话历史：pushState 截掉前进的记录再压栈（带地址时换到新地址），go 异步落地并派发 popstate；
 * 每笔记着自己的地址，落地时把真实地址换过去（层按地址认自己的记录）。
 * 路由自己的记录带位置号（vue-router 写在历史状态里），层的记录沿用下面那一笔的
 */
interface Entry {
  state: Record<string, unknown> | null
  href: string
}
let entries: Entry[] = []
let index = 0
const nativeReplaceState = History.prototype.replaceState

function setUrl(href: string) {
  nativeReplaceState.call(window.history, null, '', href)
}

beforeEach(() => {
  entries = [{ state: { position: 1 }, href: '/chat/a' }]
  index = 0
  setUrl('/chat/a')
  vi.spyOn(window.history, 'state', 'get').mockImplementation(() => entries[index]?.state ?? null)
  vi.spyOn(window.history, 'pushState').mockImplementation((state, _title, url) => {
    entries = entries.slice(0, index + 1)
    if (url) setUrl(String(url))
    entries.push({
      state: state as Entry['state'],
      href: window.location.pathname + window.location.hash,
    })
    index = entries.length - 1
  })
  vi.spyOn(window.history, 'go').mockImplementation(delta => {
    setTimeout(() => {
      index = Math.max(0, Math.min(entries.length - 1, index + Number(delta)))
      setUrl(entries[index].href)
      window.dispatchEvent(new PopStateEvent('popstate', { state: entries[index].state }))
    }, 0)
  })
  vi.spyOn(window.history, 'back').mockImplementation(() => window.history.go(-1))
})

afterEach(async () => {
  wrappers.forEach(wrapper => wrapper.unmount())
  wrappers.length = 0
  await settle()
  vi.restoreAllMocks()
})

const wrappers: ReturnType<typeof mount>[] = []

function mountLayer(open: Ref<boolean>) {
  const close = vi.fn(() => {
    open.value = false
  })
  const wrapper = mount(
    defineComponent({
      setup() {
        useHistoryLayer(() => open.value, close)
        return () => null
      },
    })
  )
  wrappers.push(wrapper)
  return { wrapper, close }
}

/** 等 watcher、队列与异步落地的后退都跑完 */
async function settle() {
  for (let round = 0; round < 4; round += 1) {
    await nextTick()
    await flushPromises()
    await new Promise(resolve => setTimeout(resolve, 0))
  }
  await whenHistorySettled()
}

/** 按一次返回键 */
async function pressBack() {
  window.history.back()
  await settle()
}

/** 按一次前进键 */
async function pressForward() {
  window.history.go(1)
  await settle()
}

/** 路由在当前地址上推一笔覆盖层地址（设置、登录） */
function pushOverlayHash(hash: string) {
  return runInHistoryQueue(async () => {
    const position = Number(entries[index].state?.position ?? 0) + 1
    window.history.pushState({ position }, '', `${window.location.pathname}${hash}`)
  })
}

/** 当前停在哪几笔上（地址） */
const visited = () => entries.slice(0, index + 1).map(entry => entry.href)

describe('临时层接住返回键', () => {
  it('打开时记一笔；按返回键只关掉这一层，不再多退', async () => {
    const open = ref(false)
    const { close } = mountLayer(open)
    open.value = true
    await settle()
    expect(index).toBe(1)

    await pressBack()
    expect(close).toHaveBeenCalledTimes(1)
    expect(index).toBe(0)
    expect(window.history.go).toHaveBeenCalledTimes(1)
  })

  it('从界面上关掉时把那一笔退掉', async () => {
    const open = ref(true)
    mountLayer(open)
    await settle()
    expect(index).toBe(1)

    open.value = false
    await settle()
    expect(index).toBe(0)
  })

  it('两层叠开：返回键先关上面一层，下面一层不动', async () => {
    const lower = ref(true)
    const upper = ref(false)
    const first = mountLayer(lower)
    const second = mountLayer(upper)
    await settle()
    upper.value = true
    await settle()
    expect(index).toBe(2)

    await pressBack()
    expect(second.close).toHaveBeenCalledTimes(1)
    expect(first.close).not.toHaveBeenCalled()
    expect(lower.value).toBe(true)
    expect(index).toBe(1)
  })

  it('两层同时关掉：两笔一起退掉，不留空转的记录', async () => {
    const lower = ref(true)
    const upper = ref(false)
    mountLayer(lower)
    mountLayer(upper)
    await settle()
    upper.value = true
    await settle()

    lower.value = false
    upper.value = false
    await settle()
    expect(index).toBe(0)
    expect(window.history.go).toHaveBeenCalledWith(-2)
  })

  it('下面一层先关、上面的还开着：按返回键关上面的时，下面那笔跟着退掉', async () => {
    const lower = ref(true)
    const upper = ref(false)
    mountLayer(lower)
    const second = mountLayer(upper)
    await settle()
    upper.value = true
    await settle()

    lower.value = false
    await settle()
    expect(index).toBe(2)

    await pressBack()
    expect(second.close).toHaveBeenCalledTimes(1)
    expect(index).toBe(0)
  })

  it('关一层的同时开另一层（两种先后）：等后退落地再记，新开的层不被误关、下面不留旧记录', async () => {
    for (const panelFirst of [true, false]) {
      entries = [{ state: { position: 1 }, href: '/chat/a' }]
      index = 0
      const panel = ref(true)
      const image = ref(false)
      // watcher 按组件挂载先后执行：先挂的先跑
      const mounted = panelFirst
        ? [mountLayer(panel), mountLayer(image)]
        : [mountLayer(image), mountLayer(panel)]
      const viewer = panelFirst ? mounted[1] : mounted[0]
      await settle()

      panel.value = false
      image.value = true
      await settle()

      expect(viewer.close).not.toHaveBeenCalled()
      expect(image.value).toBe(true)
      expect(index).toBe(1)
      expect(entries[1].state?.__layer).toBeTruthy()

      image.value = false
      await settle()
      expect(index).toBe(0)
      wrappers.forEach(wrapper => wrapper.unmount())
      wrappers.length = 0
      await settle()
    }
  })

  it('关掉层的同时推一笔覆盖层地址：等后退落地再推，推进去的那笔不会被撤掉', async () => {
    const panel = ref(true)
    mountLayer(panel)
    await settle()

    panel.value = false
    await nextTick()
    await runInHistoryQueue(async () => {
      window.history.pushState({ position: 2 }, '')
    })
    await settle()
    expect(visited()).toEqual(['/chat/a', '/chat/a'])
    expect(entries[index].state).toEqual({ position: 2 })
  })

  it('路由把这一笔替换成了别的地址（当前会话在别处被删）：层关掉时不再后退撤掉这次替换', async () => {
    const panel = ref(true)
    mountLayer(panel)
    await settle()

    // vue-router 的 replace 会把当前历史状态（含层标记）带到新地址上
    entries[index] = { state: { ...entries[index].state }, href: '/chat/b' }
    setUrl('/chat/b')
    panel.value = false
    await settle()
    expect(window.history.go).not.toHaveBeenCalled()
    expect(window.location.pathname).toBe('/chat/b')
  })

  it('换页之前收起所有层并退掉它们的记录：新地址不压在层的记录上面', async () => {
    const panel = ref(true)
    const { close } = mountLayer(panel)
    await settle()
    expect(index).toBe(1)

    const closing = closeHistoryLayers()
    await settle()
    await closing
    expect(close).toHaveBeenCalledTimes(1)
    expect(index).toBe(0)
  })

  it('层被推上来的覆盖层地址压着时关掉：那一笔留在历史里，覆盖层退回时落到它上面就接着退，不用多按一次返回', async () => {
    const workbench = ref(true)
    mountLayer(workbench)
    await settle()
    await pushOverlayHash('#login')
    await settle()
    expect(visited()).toEqual(['/chat/a', '/chat/a', '/chat/a#login'])

    // 登录成功时收起所有预览：工作台那一笔压在 #login 下面，退不掉
    workbench.value = false
    await settle()
    expect(index).toBe(2)

    // 登录框退回自己推的那一笔：落在工作台的死记录上，接着退到下面
    await historyBack()
    await settle()
    expect(index).toBe(0)
    expect(window.location.pathname + window.location.hash).toBe('/chat/a')
  })

  it('层开着时推了覆盖层地址：返回再前进回到覆盖层，层不被关掉', async () => {
    const workbench = ref(true)
    const { close } = mountLayer(workbench)
    await settle()
    await pushOverlayHash('#login')
    await settle()

    await pressBack()
    expect(index).toBe(1)
    await pressForward()
    expect(index).toBe(2)
    expect(close).not.toHaveBeenCalled()
    expect(workbench.value).toBe(true)
  })

  it('返回键关掉层后再按前进：落在那一层的死记录上，退回原处，层保持关闭', async () => {
    const panel = ref(true)
    const { close } = mountLayer(panel)
    await settle()
    await pressBack()
    expect(close).toHaveBeenCalledTimes(1)
    expect(index).toBe(0)

    await pressForward()
    expect(index).toBe(0)
    expect(close).toHaveBeenCalledTimes(1)
    expect(panel.value).toBe(false)
  })

  it('层的那一笔被路由 replace 成了别的地址：之后落到那一笔上不当死记录跳过', async () => {
    const panel = ref(true)
    mountLayer(panel)
    await settle()
    entries[index] = { state: { ...entries[index].state }, href: '/chat/b' }
    setUrl('/chat/b')
    panel.value = false
    await settle()

    await runInHistoryQueue(async () => {
      window.history.pushState({ position: 2 }, '', '/chat/c')
    })
    await pressBack()
    expect(window.location.pathname).toBe('/chat/b')
    expect(index).toBe(1)
  })

  it('同一层关掉后再打开：新记的那一笔不被当成死记录；其上推覆盖层再返回，关掉覆盖层、层还开着', async () => {
    const open = ref(false)
    const { close } = mountLayer(open)
    open.value = true
    await settle()
    open.value = false
    await settle()
    expect(visited()).toEqual(['/chat/a'])

    open.value = true
    await settle()
    expect(index).toBe(1)
    await pushOverlayHash('#login')
    await settle()
    expect(visited()).toEqual(['/chat/a', '/chat/a', '/chat/a#login'])

    // 关掉覆盖层（返回）：落在层自己的那一笔上，层还开着，前进方向不留东西
    await pressBack()
    expect(index).toBe(1)
    expect(open.value).toBe(true)
    expect(close).not.toHaveBeenCalled()

    // 再按一次返回：只关掉这一层，不离开当前页
    await pressBack()
    expect(index).toBe(0)
    expect(close).toHaveBeenCalledTimes(1)
  })

  it('组件卸载后不再记：等后退期间卸载的层不会在卸载后压一笔', async () => {
    const panel = ref(true)
    const image = ref(false)
    mountLayer(panel)
    const viewer = mountLayer(image)
    await settle()

    panel.value = false
    image.value = true
    viewer.wrapper.unmount()
    await settle()
    expect(index).toBe(0)
    expect(entries.every(entry => !entry.state?.__layer || entries.indexOf(entry) > index)).toBe(
      true
    )
  })
})
