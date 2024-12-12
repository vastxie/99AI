 type ThrottledFunction<T extends any[]> = (...args: T) => void

export function throttle<T extends any[]>(func: ThrottledFunction<T>, delay: number): ThrottledFunction<T> {
  let timeoutId: ReturnType<typeof setTimeout> | null
  let lastArgs: T

  return function throttled(...args: T) {
    lastArgs = args

    if (!timeoutId) {
      timeoutId = setTimeout(() => {
        func.apply(this, lastArgs)
        timeoutId = null
      }, delay)
    }
  }
}
