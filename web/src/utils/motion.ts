/**
 * 组件里用 Web Animations 播放的动效共用的小工具：时长与缓动取自设计变量（tokens.css），
 * 用户开启「减弱动态效果」或环境不支持时不播放。
 */

function readToken(element: Element | undefined, name: string): string {
  const own = element ? getComputedStyle(element).getPropertyValue(name).trim() : ''
  return own || getComputedStyle(document.documentElement).getPropertyValue(name).trim()
}

/** 读时长变量（如 250ms / 0.3s）并换算成毫秒 */
export function readDuration(element: Element | undefined, name: string, fallback: number): number {
  const raw = readToken(element, name)
  const value = parseFloat(raw)
  if (!Number.isFinite(value)) return fallback
  return raw.endsWith('ms') ? value : raw.endsWith('s') ? value * 1000 : fallback
}

/** 读缓动变量 */
export function readEasing(element: Element | undefined, name: string, fallback: string): string {
  return readToken(element, name) || fallback
}

/** 能不能对这个元素播放动画 */
export function canAnimate(element: Element | undefined | null): element is HTMLElement {
  if (!(element instanceof HTMLElement) || typeof element.animate !== 'function') return false
  return !window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
}

/**
 * 取消元素上正在播放的动画。取消会让动画的 finished 承诺以 AbortError 结束，
 * 这里先接住它，不留未处理的拒绝（浏览器按规范会自动标记，测试环境不一定）
 */
export function cancelAnimations(element: Element): void {
  for (const animation of element.getAnimations?.() ?? []) {
    animation.finished.catch(() => {})
    animation.cancel()
  }
}
