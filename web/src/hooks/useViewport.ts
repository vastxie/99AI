import { useMediaQuery } from '@vueuse/core'
import { effectScope, type Ref } from 'vue'

let shared: { isMobile: Ref<boolean> } | undefined

/**
 * 当前视口是否按移动端布局：宽度小于 768px。
 * 与样式层同一口径——CSS 侧的移动端布局用 `md:` 前缀、`(max-width: 767.9px)` 或 `(min-width: 768px)`
 * （设计守卫 single-breakpoint）；触控热区不看宽度，按 `(pointer: coarse)`。
 *
 * 全应用共用一个媒体查询：每条消息都会用到它，不必各注册一个监听
 */
export function useViewport() {
  shared ??= effectScope(true).run(() => ({
    isMobile: useMediaQuery('(max-width: 767.9px)'),
  }))!
  return shared
}
