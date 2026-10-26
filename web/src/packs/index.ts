/**
 * 前端扩展包注册表（内核里唯一认识 packs/ 目录的文件）。
 *
 * 每个包在 packs/<id>/index.ts 里 `export default definePack({...})`（契约见 @/core/packs/definePack），
 * 这里用 import.meta.glob 按目录发现，不点名任何包：删掉目录即消失，新增目录即装载。
 * 内核只通过挂载点（slots）、覆盖层 hash 与钩子和包交互；查询逻辑见 @/core/packs/registry。
 */
import type { ChatPackDefinition } from '@/core/packs/definePack'
import { createPackRegistry } from '@/core/packs/registry'

export * from '@/core/packs/definePack'

const modules = import.meta.glob<{ default: ChatPackDefinition }>('./*/index.ts', {
  eager: true,
})

let cache: ChatPackDefinition[] | null = null

/** 已启用的包（按目录名排序）；首次调用时收集，避免与包模块之间的加载顺序问题 */
function collectEnabledPacks(): ChatPackDefinition[] {
  if (!cache) {
    cache = Object.keys(modules)
      .sort()
      .map(path => modules[path]?.default)
      .filter((pack): pack is ChatPackDefinition => Boolean(pack && pack.enabled))
  }
  return cache
}

export const {
  enabledPacks,
  slot,
  slotByKey,
  slotKeys,
  packRoutes,
  packLocaleEntries,
  packHighlightLanguages,
  packOverlays,
  runAppReadyHooks,
  classifyChatErrorByPacks,
  handleChatErrorByPacks,
  channelLabelByPacks,
} = createPackRegistry(collectEnabledPacks)
