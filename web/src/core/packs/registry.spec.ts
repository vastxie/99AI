import { describe, expect, it, vi } from 'vitest'
import { definePack, type ChatPackDefinition } from './definePack'
import { createPackRegistry } from './registry'

const component = () => Promise.resolve({ default: {} })

function registry(packs: ChatPackDefinition[]) {
  return createPackRegistry(() => packs)
}

const alpha = definePack({
  id: 'alpha',
  tier: 'feature',
  enabled: true,
  slots: {
    'settings.tab': [
      { id: 'alpha.late', key: 'late', order: 200, component },
      { id: 'alpha.default', key: 'plain', component },
    ],
  },
  overlays: [{ hash: '#alpha' }],
  hooks: {
    classifyChatError: error => (error === 'quota' ? 'alpha-quota' : undefined),
    onChatError: error => error.kind === 'alpha-quota',
    channelLabel: channel => (channel === 'feishu' ? '飞书' : undefined),
  },
})

const beta = definePack({
  id: 'beta',
  tier: 'system',
  enabled: true,
  slots: {
    'settings.tab': [{ id: 'beta.first', key: 'first', order: 10, component }],
  },
  hooks: {
    classifyChatError: () => 'beta-any',
  },
})

describe('扩展包注册表', () => {
  it('挂载点贡献跨包按 order 升序合并（默认 100），可按 key 查找', () => {
    const packs = registry([alpha, beta])
    expect(packs.slot('settings.tab').map(item => item.id)).toEqual([
      'beta.first',
      'alpha.default',
      'alpha.late',
    ])
    expect(packs.slotByKey('settings.tab', 'plain')?.id).toBe('alpha.default')
    expect(packs.slotKeys('settings.tab')).toEqual(['first', 'plain', 'late'])
    expect(packs.slot('side.panel')).toEqual([])
  })

  it('钩子按包顺序询问：第一个认出错误的包说了算；没有包认识时交还内核', () => {
    const packs = registry([alpha, beta])
    expect(packs.classifyChatErrorByPacks('quota')).toBe('alpha-quota')
    expect(packs.classifyChatErrorByPacks('other')).toBe('beta-any')
    expect(registry([alpha]).classifyChatErrorByPacks('other')).toBeUndefined()

    const context = { isMobile: false, isAuthenticated: true }
    expect(
      packs.handleChatErrorByPacks({ kind: 'alpha-quota', message: '', raw: null }, context)
    ).toBe(true)
    expect(packs.handleChatErrorByPacks({ kind: 'x', message: '', raw: null }, context)).toBe(false)
    expect(packs.channelLabelByPacks('feishu')).toBe('飞书')
    expect(packs.channelLabelByPacks('dingtalk')).toBeUndefined()
  })

  it('应用就绪钩子按包顺序逐个等待', async () => {
    const order: string[] = []
    const make = (id: string, delay: number) =>
      definePack({
        id,
        tier: 'feature',
        enabled: true,
        hooks: {
          onAppReady: () =>
            new Promise<void>(resolve => setTimeout(() => (order.push(id), resolve()), delay)),
        },
      })
    vi.useFakeTimers()
    try {
      const done = registry([make('slow', 20), make('fast', 1)]).runAppReadyHooks({
        isOAuthCallbackRoute: false,
      })
      await vi.runAllTimersAsync()
      await done
      expect(order).toEqual(['slow', 'fast'])
    } finally {
      vi.useRealTimers()
    }
  })

  it('覆盖层与路由从各包汇总', () => {
    const packs = registry([alpha, beta])
    expect(packs.packOverlays().map(item => item.hash)).toEqual(['#alpha'])
    expect(packs.packRoutes()).toEqual([])
  })
})
