import { computed, defineAsyncComponent, markRaw, type Component } from 'vue'
import { slot, type PackSlotContribution, type PackSlotName } from '@/packs'

const resolved = new Map<string, Component>()

/** 把挂载点贡献解析成可渲染的异步组件（按贡献 id 缓存，避免重复创建） */
export function resolvePackComponent(contribution: PackSlotContribution): Component {
  let component = resolved.get(contribution.id)
  if (!component) {
    component = markRaw(defineAsyncComponent(contribution.component))
    resolved.set(contribution.id, component)
  }
  return component
}

/** 某挂载点的贡献列表（附带已解析的组件），供需要逐项控制 props / 事件的宿主使用 */
export function usePackSlot(name: PackSlotName) {
  return computed(() =>
    slot(name).map(contribution => ({
      ...contribution,
      view: resolvePackComponent(contribution),
    }))
  )
}
