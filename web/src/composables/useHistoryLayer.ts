import { nextTick, onBeforeUnmount, watch } from 'vue'

const LAYER_STATE_KEY = '__layer'
/** 后退迟迟没有落地时不再等（正常情况下几毫秒内就会收到 popstate） */
const BACK_SETTLE_TIMEOUT_MS = 500
/** 连着跳过死记录的上限：历史表现异常时不至于一路退下去 */
const MAX_DEAD_ENTRY_SKIPS = 8
/** 记着的已关层（用来认出死记录）的上限：只需要最近的 */
const MAX_RETIRED_LAYERS = 50
/** 每次页面加载不同：刷新、标签页被回收再恢复后，历史里残留的旧记录不会被新开的层认成自己的 */
const PAGE_KEY = Math.random().toString(36).slice(2, 8)
let layerSeq = 0

interface LayerEntry {
  id: string
  /** 记这一笔时的地址：路由 replace 会把历史状态（含层标记）带到新地址上，地址变了就不再是这一层的记录 */
  href: string
  /**
   * 记这一笔时路由的位置号（vue-router 写在历史状态里，层的记录沿用下面那一笔的）：
   * 落到没有层标记的记录上时，据此分出哪些层在它下面
   */
  position?: number
  /** 层已经关了，记录还压在上面一层下面：等上面的退掉时一起退 */
  released: boolean
  close: () => void
  /** 返回键退掉了这一笔 */
  onPop: () => void
}

/** 本页记进历史的层，自下而上 */
const stack: LayerEntry[] = []
/**
 * 已经不在栈里的层的记录（id → 地址）：返回键退掉的、界面上关掉后退掉的，以及关掉时被别的记录压着、
 * 没能退掉的。前进或后退落到这样一笔上（地址也对得上）就是停在死记录上：它和下面那笔地址相同，
 * 停在这里按返回键看起来没反应，所以接着退
 */
const retired = new Map<string, string>()
/**
 * 历史操作排成一队：层的记一笔、退一笔，覆盖层（设置、登录）的 hash 推入与退回都在这里排队。
 * 后退要到下一个任务才落地，不排队的话，紧接着推进去的一笔会被这次后退吃掉
 * （关掉工作台的同时打开设置：设置的 hash 刚推进去就被撤掉，设置一闪就关）。
 *
 * 排队的任务里（以及路由守卫里）不要再调用 whenHistorySettled / runInHistoryQueue /
 * closeHistoryLayers：它们要等队列里排在前面的任务，也就是等自己，会永远挂起，之后的历史操作全部卡住
 */
let queue: Promise<void> = Promise.resolve()
/** 本模块发起的后退还没落地：这次 popstate 是自己的，栈已经先改好了 */
let ownBackInFlight = false

function enqueue(task: () => void | Promise<void>): Promise<void> {
  const next = queue.then(task)
  queue = next.catch(() => undefined)
  return next
}

/** 等排在前面的历史操作都落地（不要在排队的任务里调用，见 queue） */
export function whenHistorySettled(): Promise<void> {
  return queue
}

/**
 * 在历史队列里执行一次路由跳转或别的历史操作，前面的后退落地之后才开始
 * （不要在排队的任务里调用，见 queue）
 */
export function runInHistoryQueue<T>(task: () => Promise<T>): Promise<T> {
  let result!: T
  return enqueue(async () => {
    result = await task()
  }).then(() => result)
}

function historyState() {
  return window.history.state as Record<string, unknown> | null
}

function currentLayerId(): string | undefined {
  const value = historyState()?.[LAYER_STATE_KEY]
  return typeof value === 'string' ? value : undefined
}

function currentPosition(): number | undefined {
  const value = historyState()?.position
  return typeof value === 'number' ? value : undefined
}

/** 历史当前停在这一笔上（地址也没被 replace 换过） */
function isCurrent(entry: LayerEntry) {
  return currentLayerId() === entry.id && window.location.href === entry.href
}

function retire(entry: LayerEntry) {
  retired.delete(entry.id)
  retired.set(entry.id, entry.href)
  if (retired.size > MAX_RETIRED_LAYERS) retired.delete(retired.keys().next().value as string)
}

/** 停在一笔死记录上：已经不在栈里的层的记录，地址也没被 replace 换过 */
function isOnDeadEntry() {
  const id = currentLayerId()
  if (!id || retired.get(id) !== window.location.href) return false
  return !stack.some(entry => entry.id === id)
}

/**
 * 后退 steps 笔，等它落地（或超时）；落地了返回 true。
 *
 * 靠 popstate 判断落地，之后按那时的路由地址继续（覆盖层同步读 route.hash）：浏览器依次调用
 * popstate 的监听、每个之间先跑完微任务，vue-router 的监听注册得比这里早，同地址或只改 hash 的
 * 后退在它那里全是微任务，所以这里收到时路由已经更新好了。以后给这类导航加上异步守卫或懒加载，
 * 这个前提就不成立了
 */
function goBack(steps: number): Promise<boolean> {
  return new Promise<boolean>(resolve => {
    const finish = (landed: boolean) => {
      window.removeEventListener('popstate', onLanded)
      window.clearTimeout(timer)
      ownBackInFlight = false
      resolve(landed)
    }
    const onLanded = () => finish(true)
    const timer = window.setTimeout(() => finish(false), BACK_SETTLE_TIMEOUT_MS)
    window.addEventListener('popstate', onLanded)
    ownBackInFlight = true
    window.history.go(-steps)
  })
}

/** 落在死记录上：接着退，直到停在活的记录上 */
async function skipDeadEntries() {
  for (let skips = 0; skips < MAX_DEAD_ENTRY_SKIPS && isOnDeadEntry(); skips += 1) {
    if (!(await goBack(1))) return
  }
}

async function back(steps: number): Promise<void> {
  if (await goBack(steps)) await skipDeadEntries()
}

/** 在队列里后退一笔（覆盖层关掉时退掉自己推进去的 hash） */
export function historyBack(): Promise<void> {
  return enqueue(() => back(1))
}

/**
 * 退掉栈顶已经关掉的层（同一刻关掉的几层一次退完）。
 * 历史已经不停在栈顶那一笔上（路由在层上面推了一笔、地址被 replace 换了）时只丢掉记录：
 * 退了反而会撤掉那次跳转；压在下面的那几笔成了死记录，之后后退落到上面时自动跳过
 */
function unwindReleased(): Promise<void> | void {
  const top = stack.at(-1)
  if (!top?.released) return
  const onTop = isCurrent(top)
  let steps = 0
  while (stack.at(-1)?.released) {
    retire(stack.pop()!)
    steps += 1
  }
  if (onTop) return back(steps)
}

/**
 * 返回键（或前进键）落到的这一笔下面还有几层：落在某一层的记录上，就是它和它下面的层；
 * 落在别的记录上（路由自己的一笔、死记录），按路由的位置号分——位置在它之前的层还在它下面
 * （前进到了在层上面推的地址，比如设置），其余的都被退掉了；读不到位置号就当作都退掉了
 */
function layersBelowCurrent(): number {
  const id = currentLayerId()
  const index = id ? stack.findIndex(entry => entry.id === id) : -1
  if (index >= 0) return index + 1
  const position = currentPosition()
  if (position === undefined) return 0
  let kept = 0
  while (kept < stack.length && (stack[kept].position ?? Infinity) < position) kept += 1
  return kept
}

function onPopState() {
  if (ownBackInFlight) return
  const removed = stack.splice(layersBelowCurrent())
  for (const entry of removed.reverse()) {
    retire(entry)
    if (!entry.released) entry.onPop()
  }
  // 退到了一笔已经关掉的层上：接着退；停在死记录上也接着退
  if (stack.at(-1)?.released) void enqueue(unwindReleased)
  else if (isOnDeadEntry()) void enqueue(skipDeadEntries)
}

if (typeof window !== 'undefined') window.addEventListener('popstate', onPopState)

/**
 * 换页之前收起所有临时层并退掉它们的记录，等退完再跳：否则新地址压在层的记录上面，
 * 回来时要多按一次返回（不要在排队的任务里调用，见 queue）
 */
export async function closeHistoryLayers(): Promise<void> {
  for (const entry of [...stack].reverse()) {
    if (!entry.released) entry.close()
  }
  // 关闭经 watcher 生效，排进队列的退回要等到这一刻之后
  await nextTick()
  await whenHistorySettled()
}

/**
 * 让一个临时层（手机底部面板、代码工作台、图片预览）接住浏览器的返回：
 * 打开时在历史里记一笔（地址不变，沿用路由自己的历史状态），按返回键（安卓返回键、浏览器后退）
 * 只关掉这一层，不离开当前页面；从界面上关掉时把这一笔退掉，历史里不留空转的记录。
 *
 * 多层叠开时各记各的：返回键先关最上面的一层；下面一层先关掉的，等上面一层退掉时一起退。
 */
export function useHistoryLayer(isOpen: () => boolean, close: () => void) {
  let entry: LayerEntry | null = null
  let disposed = false

  async function record() {
    // 同一刻关掉的层（watcher 可能排在后面）先排进队列退掉，再记这一笔
    await nextTick()
    await enqueue(() => {
      if (disposed || entry || !isOpen()) return
      // 每记一笔换一个 id：同一层关掉后再打开，新记的这一笔不会被认成上一次留下的死记录
      const id = `${PAGE_KEY}-${++layerSeq}`
      const position = currentPosition()
      window.history.pushState({ ...window.history.state, [LAYER_STATE_KEY]: id }, '')
      const recorded: LayerEntry = {
        id,
        href: window.location.href,
        position,
        released: false,
        close,
        onPop: () => {
          if (entry === recorded) entry = null
          if (isOpen()) close()
        },
      }
      entry = recorded
      stack.push(recorded)
    })
  }

  /** 层已经关了：它那一笔等队列轮到时退掉（压在别的层下面时，等上面的一起退） */
  function release() {
    const current = entry
    entry = null
    if (!current) return
    current.released = true
    void enqueue(unwindReleased)
  }

  watch(
    () => Boolean(isOpen()),
    open => {
      if (open) void record()
      else release()
    },
    { immediate: true }
  )
  onBeforeUnmount(() => {
    disposed = true
    release()
  })
}
