import { onBeforeUnmount, ref } from 'vue'

/** 发码后的重发倒计时（秒）：再次开始时从头计，组件卸载时自动停 */
export function useCountdown() {
  const remaining = ref(0)
  let timer: ReturnType<typeof setInterval> | undefined

  function stop() {
    if (timer) clearInterval(timer)
    timer = undefined
  }

  function start(seconds = 60) {
    stop()
    remaining.value = seconds
    timer = setInterval(() => {
      remaining.value -= 1
      if (remaining.value <= 0) stop()
    }, 1000)
  }

  onBeforeUnmount(stop)
  return { remaining, start }
}
