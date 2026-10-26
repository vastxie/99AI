import type { RouteRecordRaw } from 'vue-router'
import type {
  ChatPackDefinition,
  PackChatError,
  PackOverlay,
  PackSlotContribution,
  PackSlotName,
} from './definePack'

/**
 * 包注册表的查询逻辑（纯函数，不认识 packs/ 目录）：由 @/packs 传入已启用的包。
 * 包按目录名排序；挂载点贡献按 order 升序（默认 100）；钩子按包顺序询问，第一个给出结果的包说了算。
 */
export function createPackRegistry(packs: () => ChatPackDefinition[]) {
  function slot(name: PackSlotName): PackSlotContribution[] {
    return packs()
      .flatMap(pack => pack.slots?.[name] ?? [])
      .sort((a, b) => (a.order ?? 100) - (b.order ?? 100))
  }

  return {
    enabledPacks: packs,
    slot,
    /** 按 key 查找挂载点贡献（渲染器 / 面板 / 子视图） */
    slotByKey(name: PackSlotName, key: string): PackSlotContribution | undefined {
      return slot(name).find(item => item.key === key)
    },
    slotKeys(name: PackSlotName): string[] {
      return slot(name)
        .map(item => item.key)
        .filter((key): key is string => Boolean(key))
    },
    packRoutes(): RouteRecordRaw[] {
      return packs().flatMap(pack => pack.routes ?? [])
    },
    /** 各包的语言包片段：[locale, messages] */
    packLocaleEntries(): Array<[string, Record<string, unknown>]> {
      return packs().flatMap(pack => Object.entries(pack.locales ?? {}))
    },
    /** 各包声明的代码高亮语言：[名称, 语言定义] */
    packHighlightLanguages() {
      return packs().flatMap(pack => Object.entries(pack.highlightLanguages ?? {}))
    },
    packOverlays(): PackOverlay[] {
      return packs().flatMap(pack => pack.overlays ?? [])
    },
    async runAppReadyHooks(context: { isOAuthCallbackRoute: boolean }) {
      for (const pack of packs()) await pack.hooks?.onAppReady?.(context)
    },
    classifyChatErrorByPacks(error: unknown): string | undefined {
      for (const pack of packs()) {
        const kind = pack.hooks?.classifyChatError?.(error)
        if (kind) return kind
      }
      return undefined
    },
    handleChatErrorByPacks(
      error: PackChatError,
      context: { isMobile: boolean; isAuthenticated: boolean }
    ): boolean {
      return packs().some(pack => pack.hooks?.onChatError?.(error, context) === true)
    },
    channelLabelByPacks(channel: string): string | undefined {
      for (const pack of packs()) {
        const label = pack.hooks?.channelLabel?.(channel)
        if (label) return label
      }
      return undefined
    },
  }
}
