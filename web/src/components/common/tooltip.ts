import { useMediaQuery } from '@vueuse/core'
import { effectScope, type Ref } from 'vue'

export type TooltipPlacement = 'top' | 'bottom' | 'left' | 'right'

/**
 * 提示气泡的方位类写成字面量：recipes.css 的 components 层只输出源码里出现过原文的类，
 * `tooltip-${placement}` 这样拼出来的类名扫不到，生产构建里会被清掉（设计守卫 layered-class-literal）
 */
export const TOOLTIP_PLACEMENT_CLASS: Record<TooltipPlacement, string> = {
  top: 'tooltip-top',
  bottom: 'tooltip-bottom',
  left: 'tooltip-left',
  right: 'tooltip-right',
}

/** 自绘提示气泡不显示的环境：与 recipes.css 里 .tooltip 的媒体查询是同一条件，改一处要同步另一处 */
export const TOOLTIP_HIDDEN_MEDIA = '(hover: none), (pointer: coarse), (max-width: 767.9px)'

let tooltipHidden: Ref<boolean> | undefined
/** 当前环境里自绘提示是否被样式层关掉（全应用共用一个媒体查询） */
export function useTooltipHidden() {
  tooltipHidden ??= effectScope(true).run(() => useMediaQuery(TOOLTIP_HIDDEN_MEDIA))!
  return tooltipHidden
}

/**
 * 指针点出来的 click（键盘回车、空格触发的 click 的 detail 是 0）：
 * 指针点过之后先不显示提示、不挡视线；键盘用户照常靠它看到按钮的名字
 */
export function isPointerClick(event: MouseEvent) {
  return event.detail > 0
}
