/**
 * 弹窗可访问性统一 composable（Dialog / Sheet 行为契约，见 web/DESIGN.md）
 *
 * 统一承载：
 * - Esc 关闭：监听挂在 document 上，仅弹窗打开期间生效；模块级栈保证多层弹窗
 *   叠加时只有最上层响应 Esc，不会一次按键同时关掉多层。弹窗之上的外部浮层
 *   （Teleport 到 body 的下拉菜单等）可通过 `registerFloatingLayer` 登记，
 *   登记期间 Esc 与 Tab 让位给浮层自身。
 * - 打开时把焦点移入弹窗：优先 `initialFocus` 指定元素，其次弹窗内第一个可聚焦
 *   元素，最后退化为弹窗容器本身（容器通过 tabindex="-1" 可聚焦）。
 * - 焦点陷阱：Tab / Shift+Tab 在弹窗内循环，焦点落在弹窗外时拉回弹窗内。
 * - 关闭后焦点返回：把焦点还给打开前的触发元素（仅在焦点仍留在弹窗内或已
 *   落回 body 时归还，避免抢走用户主动移到别处的焦点）。
 *
 * 用法：
 *   const { setDialogRef, dialogAttrs } = useDialogA11y(() => props.visible, {
 *     onClose: handleClose,
 *   })
 *   模板中弹窗根节点绑定 :ref="setDialogRef"（函数 ref）与 v-bind="dialogAttrs"。
 *
 * 注意：composable 只负责行为与 ARIA 语义，不改变任何业务关闭逻辑——Esc 触发的
 * 是调用方提供的 onClose，与点击遮罩 / 关闭按钮走同一条业务路径。
 */
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import type { ComponentPublicInstance, Ref } from 'vue'

export interface UseDialogA11yOptions {
  /** 请求关闭时的回调（Esc 触发）；由调用方执行真正的 visible=false 业务逻辑 */
  onClose?: () => void
  /** 打开时优先聚焦的元素；返回 null/undefined 时回落到默认策略 */
  initialFocus?: () => HTMLElement | null | undefined
  /**
   * 是否允许 Esc 关闭，默认 true。
   * 为 false 时该层弹窗忽略 Esc，且不会把 Esc 透传给下层弹窗（强制阅读类弹窗）。
   */
  closeOnEsc?: boolean
}

export interface UseDialogA11yReturn {
  /** 函数 ref：绑定到弹窗根节点（弹窗 surface，而非遮罩层）的 :ref */
  setDialogRef: (el: Element | ComponentPublicInstance | null) => void
  /** 绑定到弹窗根节点的 ARIA / 焦点 attrs */
  dialogAttrs: {
    readonly role: 'dialog'
    readonly 'aria-modal': 'true'
    readonly tabindex: '-1'
  }
}

interface DialogStackEntry {
  /** 弹窗根节点；打开后的 nextTick 内填充，关闭 / 过渡期间仍保留元素引用 */
  root: HTMLElement | null
  closeOnEsc: boolean
  requestClose: () => void
  /** 打开顺序号，与外部浮层共用计数器，用于判断谁在更上层 */
  seq: number
}

/** 登记外部浮层（Teleport 到 body、DOM 上不在弹窗内，但语义上属于弹窗内容）的选项 */
export interface FloatingLayerOptions {
  /** 浮层根节点；登记期间该浮层视为「弹窗之上的一层」 */
  getRoot: () => HTMLElement | null
  /**
   * 浮层是否自行消费 Esc，默认 true。
   * 为 true 时下层弹窗不响应 Esc（一次 Esc 只关最内层浮层）；
   * 为 false（如强制常开的菜单）时 Esc 照常透传给弹窗。
   */
  handlesEscape?: () => boolean
}

interface FloatingLayerEntry extends Required<FloatingLayerOptions> {
  seq: number
}

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'area[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
  '[contenteditable="true"]',
].join(',')

/** 模块级弹窗栈：先开的在栈底，最上层弹窗优先响应键盘事件 */
const dialogStack: DialogStackEntry[] = []
/** 模块级外部浮层登记表：登记期间视为打开状态 */
const floatingLayers: FloatingLayerEntry[] = []
/** 弹窗与浮层共用的单调递增打开序号 */
let layerSeq = 0
let keydownBound = false

/** 有没有打开着的弹窗（页面级快捷键在弹窗打开时让位） */
export function hasOpenDialog(): boolean {
  return dialogStack.length > 0
}

/**
 * 登记一个「打开中的外部浮层」（Teleport 到 body 的下拉菜单等）。
 *
 * 浮层 DOM 不是弹窗的后代，纯按 DOM 包含关系判断会把它误判成「弹窗外」，
 * 导致 Esc 一次关两层、Tab 把焦点从菜单强行拉回弹窗。登记后：
 * - 该浮层比弹窗晚打开且自行处理 Esc 时，弹窗不响应 Esc；
 * - 焦点落在该浮层内时，弹窗焦点陷阱不拉回焦点。
 *
 * @returns 注销函数；浮层关闭 / 组件卸载时必须调用。
 */
export function registerFloatingLayer(options: FloatingLayerOptions): () => void {
  const entry: FloatingLayerEntry = {
    seq: ++layerSeq,
    getRoot: options.getRoot,
    handlesEscape: options.handlesEscape ?? (() => true),
  }
  floatingLayers.push(entry)
  return () => {
    const index = floatingLayers.indexOf(entry)
    if (index >= 0) floatingLayers.splice(index, 1)
  }
}

/** 节点是否位于某个已登记的外部浮层内 */
function isInsideFloatingLayer(node: Node): boolean {
  return floatingLayers.some(layer => {
    const root = layer.getRoot()
    return !!root && root.contains(node)
  })
}

/** 是否存在比该弹窗更晚打开、且会自行消费 Esc 的外部浮层 */
function hasEscapeOwnerAbove(dialogSeq: number): boolean {
  return floatingLayers.some(layer => layer.seq > dialogSeq && layer.handlesEscape())
}

function collectFocusable(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(el => {
    // 切页动画会让不可交互页继续参与布局；不能把其子按钮当成焦点环末项。
    if (el.closest('[inert], [aria-hidden="true"]')) return false
    // 过滤 display:none / 未渲染节点；已聚焦元素始终视为可聚焦
    return el === document.activeElement || el.getClientRects().length > 0
  })
}

/** 元素当前是否还能真正接收焦点（在文档内、非 body、未被禁用 / 隐藏 / inert） */
function isFocusRestorable(el: HTMLElement): boolean {
  if (!el.isConnected) return false
  if (el === document.body || el === document.documentElement) return false
  if (el.hasAttribute('disabled')) return false
  if (el.getAttribute('aria-hidden') === 'true') return false
  if (el.closest('[inert]')) return false
  if (el === document.activeElement) return true
  return el.getClientRects().length > 0
}

/** 归还焦点的目标：优先原触发元素，其次最近的可聚焦祖先 */
function resolveRestoreTarget(target: HTMLElement | null): HTMLElement | null {
  if (!target) return null
  if (isFocusRestorable(target)) return target

  let node = target.parentElement
  while (node) {
    if (node.matches(FOCUSABLE_SELECTOR) && isFocusRestorable(node)) return node
    node = node.parentElement
  }
  return null
}

function handleEscape(event: KeyboardEvent, top: DialogStackEntry) {
  // 已被内层组件处理（如输入法取消、下拉菜单自行关闭并 preventDefault）时不重复响应
  if (event.defaultPrevented || event.isComposing) return

  const root = top.root
  if (!root) return

  // 本层弹窗之上还有已登记的浮层（如弹窗内 Teleport 到 body 的下拉菜单）且它自行
  // 处理 Esc 时让位：这一判定不依赖焦点位置，浮层用鼠标打开（焦点仍在触发按钮或
  // 落回 body）时同样成立，保证一次 Esc 只关最内层，浮层关闭后再按才关弹窗。
  if (hasEscapeOwnerAbove(top.seq)) return

  // 焦点位于其他浮层（如 Teleport 到 body 的菜单）时，交由对应浮层自行处理，
  // 避免一次 Esc 同时关闭菜单和弹窗。
  const target = event.target
  if (
    target instanceof Node &&
    target !== document &&
    target !== document.body &&
    target !== document.documentElement &&
    !root.contains(target)
  ) {
    return
  }

  if (!top.closeOnEsc) return

  event.preventDefault()
  top.requestClose()
}

function handleTabTrap(event: KeyboardEvent, top: DialogStackEntry) {
  const root = top.root
  if (!root) return

  const focusables = collectFocusable(root)
  if (focusables.length === 0) {
    // 弹窗内暂无可聚焦元素（如按钮仍处于 disabled 倒计时），焦点停在容器上
    event.preventDefault()
    root.focus()
    return
  }

  const first = focusables[0]
  const last = focusables[focusables.length - 1]
  const active = document.activeElement
  const activeInDialog = active instanceof HTMLElement && root.contains(active)

  if (!activeInDialog) {
    // 焦点在已登记的外部浮层（Teleport 到 body 的下拉菜单）内时交由浮层自行处理：
    // 这类节点 DOM 上不是弹窗后代，但语义上属于弹窗内容，强行拉回会让菜单卡在打开态
    if (active instanceof HTMLElement && isInsideFloatingLayer(active)) return

    // 焦点在弹窗外时，Tab 直接拉回弹窗内
    event.preventDefault()
    ;(event.shiftKey ? last : first).focus()
    return
  }

  if (!event.shiftKey && active === last) {
    event.preventDefault()
    first.focus()
    return
  }

  if (event.shiftKey && (active === first || active === root)) {
    event.preventDefault()
    last.focus()
  }
}

function onDocumentKeydown(event: KeyboardEvent) {
  const top = dialogStack[dialogStack.length - 1]
  if (!top) return

  if (event.key === 'Escape') {
    handleEscape(event, top)
    return
  }

  if (event.key === 'Tab') {
    handleTabTrap(event, top)
  }
}

function syncDocumentKeydown() {
  if (typeof document === 'undefined') return
  if (dialogStack.length > 0 && !keydownBound) {
    document.addEventListener('keydown', onDocumentKeydown)
    keydownBound = true
    return
  }
  if (dialogStack.length === 0 && keydownBound) {
    document.removeEventListener('keydown', onDocumentKeydown)
    keydownBound = false
  }
}

/**
 * @param visible 弹窗可见状态：Ref / computed，或 getter（如 `() => props.visible`）
 * @param options 关闭回调、初始聚焦与 Esc 策略
 */
export function useDialogA11y(
  visible: Ref<boolean> | (() => boolean),
  options: UseDialogA11yOptions = {}
): UseDialogA11yReturn {
  const dialogRef = ref<HTMLElement | null>(null)
  // 函数 ref：模板绑定 :ref="setDialogRef"。
  // 不直接返回 dialogRef 是因为模板表达式会自动解包 Ref（:ref 拿到的是值），
  // 而字符串 ref 又不被 vue-tsc 计为变量引用（触发 noUnusedLocals 误报）。
  const setDialogRef = (el: Element | ComponentPublicInstance | null) => {
    dialogRef.value = el instanceof HTMLElement ? el : null
  }
  const dialogAttrs = {
    role: 'dialog',
    'aria-modal': 'true',
    tabindex: '-1',
  } as const

  const isVisible = typeof visible === 'function' ? computed(visible) : visible

  let entry: DialogStackEntry | null = null
  let previouslyFocused: HTMLElement | null = null

  function moveFocusIntoDialog() {
    const root = dialogRef.value
    if (!root) return

    const preferred = options.initialFocus?.()
    if (preferred && preferred.isConnected) {
      preferred.focus()
      return
    }

    // 子组件已自行聚焦（落在弹窗内）时不抢焦点
    const active = document.activeElement
    if (active instanceof HTMLElement && root.contains(active)) return

    const target = collectFocusable(root)[0] ?? root
    target.focus()
  }

  function open() {
    // SSR / 非浏览器环境安全：无 document 时整套行为退化为 no-op
    if (typeof document === 'undefined' || entry) return

    const active = document.activeElement
    previouslyFocused = active instanceof HTMLElement ? active : null

    entry = {
      root: dialogRef.value,
      closeOnEsc: options.closeOnEsc !== false,
      requestClose: () => {
        options.onClose?.()
      },
      seq: ++layerSeq,
    }
    dialogStack.push(entry)
    syncDocumentKeydown()

    void nextTick(() => {
      if (!entry || !isVisible.value) return
      // v-if 渲染完成后再取根节点；过渡关闭期间 entry.root 仍保留元素引用
      entry.root = dialogRef.value
      moveFocusIntoDialog()
    })
  }

  function restoreFocus(root: HTMLElement | null) {
    // 触发元素可能在弹窗打开期间失去可聚焦性（如所在下拉菜单已收起 → display:none /
    // inert，或干脆记录到了 body），此时 focus() 是空操作、焦点留在 body：
    // 回退到最近的可聚焦祖先，找不到就保持现状而不是假装归还成功。
    const target = resolveRestoreTarget(previouslyFocused)
    if (!target) return

    // 仅当焦点仍在弹窗内（或已随弹窗移除落回 body）时归还，
    // 避免抢走用户在弹窗外主动获得的焦点。
    const active = document.activeElement
    const focusIsFree =
      !active ||
      active === document.body ||
      active === document.documentElement ||
      (root !== null && root.contains(active))
    if (!focusIsFree) return

    target.focus()
  }

  function close() {
    if (!entry) return

    const closingEntry = entry
    entry = null

    const index = dialogStack.indexOf(closingEntry)
    if (index >= 0) dialogStack.splice(index, 1)
    syncDocumentKeydown()

    restoreFocus(closingEntry.root)
    previouslyFocused = null
  }

  watch(
    isVisible,
    value => {
      if (value) {
        open()
        return
      }
      close()
    },
    { immediate: true, flush: 'post' }
  )

  // 组件卸载时出栈并移除监听（此时 DOM 尚在，可按容器归还焦点）
  onBeforeUnmount(close)

  return { setDialogRef, dialogAttrs }
}
