import { createPinia, setActivePinia } from 'pinia'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import i18n from '@/locales'
import { useChatStore } from '@/store/modules/chat'
import { useModelCatalogStore } from '@/store/modules/modelCatalog'
import ModelSelector from './index.vue'

const layoutState = vi.hoisted(() => ({
  state: undefined as { isMobile: boolean } | undefined,
}))

vi.mock('@/hooks/useViewport', async () => {
  const { reactive, toRef } = await import('vue')
  layoutState.state ||= reactive({ isMobile: false })
  return {
    useViewport: () => ({
      isMobile: toRef(layoutState.state!, 'isMobile'),
    }),
  }
})

const toasts = vi.hoisted(() => ({ error: vi.fn(), warning: vi.fn() }))
vi.mock('@/utils/message', () => ({
  message: () => toasts,
}))
const groupApi = vi.hoisted(() => ({ update: vi.fn() }))
vi.mock('@/api/chatGroup', async importOriginal => ({
  ...(await importOriginal<typeof import('@/api/chatGroup')>()),
  fetchUpdateChatGroupAPI: groupApi.update,
}))

const MODEL_OPTIONS = [
  {
    id: 1,
    model: 'model-a',
    modelName: 'Model A',
    capabilities: {
      reasoningControl: { levels: ['low', 'medium', 'high'], defaultLevel: 'medium' },
    },
  },
  {
    id: 2,
    model: 'model-b',
    modelName: 'Model B',
    capabilities: {
      reasoningControl: { levels: ['off', 'medium'], defaultLevel: 'off' },
    },
  },
]

const ALL_REASONING_LEVELS: Chat.ReasoningEffort[] = [
  'off',
  'minimal',
  'low',
  'medium',
  'high',
  'xhigh',
  'max',
]

let wrapper: VueWrapper | undefined

async function mountSelector(
  options: {
    modelIndex?: number
    modelName?: string
    reasoningEffort?: Chat.ReasoningEffort
    reasoningLevels?: Chat.ReasoningEffort[]
  } = {}
) {
  const pinia = createPinia()
  setActivePinia(pinia)

  const selectedModel = MODEL_OPTIONS[options.modelIndex ?? 0]
  const primaryModel = {
    ...selectedModel,
    modelName: options.modelName || selectedModel.modelName,
    ...(options.reasoningLevels
      ? {
          capabilities: {
            reasoningControl: {
              levels: options.reasoningLevels,
              defaultLevel: options.reasoningEffort || 'medium',
            },
          },
        }
      : {}),
  }

  const modelCatalogStore = useModelCatalogStore()
  modelCatalogStore.modelList = MODEL_OPTIONS.map(model =>
    model.model === primaryModel.model ? primaryModel : model
  )
  modelCatalogStore.baseConfig = {
    reasoningEffort: options.reasoningEffort || 'medium',
    modelInfo: {
      ...primaryModel,
    },
  }

  const chatStore = useChatStore()
  chatStore.setDraftConfig(modelCatalogStore.baseConfig)

  wrapper = mount(ModelSelector, {
    attachTo: document.body,
    global: {
      plugins: [pinia, i18n],
      stubs: {
        transition: false,
        Teleport: true,
        ModelAvatar: { template: '<span class="model-avatar-stub" />' },
      },
    },
  })
  await nextTick()
  return { chatStore, wrapper }
}

async function openMenu(currentWrapper: VueWrapper) {
  await currentWrapper.get('button[aria-controls^="dropdown-menu-"]').trigger('click')
  await nextTick()
  await nextTick()
}

afterEach(() => {
  layoutState.state!.isMobile = false
  wrapper?.unmount()
  wrapper = undefined
  document.body.innerHTML = ''
})

describe('ModelSelector 桌面交互', () => {
  it('刻度悬停只改变视觉反馈，不改变档位、不保存；离开与触屏不残留悬停', async () => {
    const { wrapper, chatStore } = await mountSelector()
    await openMenu(wrapper)
    const save = vi.spyOn(chatStore, 'applySessionModelConfig')
    const slider = wrapper.get<HTMLInputElement>('.discrete-slider-input')
    vi.spyOn(slider.element, 'getBoundingClientRect').mockReturnValue({
      left: 100,
      width: 228,
    } as DOMRect)
    await slider.trigger('pointermove', { pointerType: 'mouse', clientX: 114 })
    expect(wrapper.findAll('.discrete-slider-tick.is-hovered')).toHaveLength(1)
    expect(slider.element.value).toBe('1')
    expect(save).not.toHaveBeenCalled()
    await slider.trigger('pointermove', { pointerType: 'mouse', clientX: 214 })
    expect(wrapper.get('.discrete-slider-thumb').classes()).toContain('is-hovered')
    expect(save).not.toHaveBeenCalled()
    expect(wrapper.get('button[aria-controls^="dropdown-menu-"]').classes()).toContain(
      'ui-button-no-scale'
    )
    expect(wrapper.get('.model-selector-model-entry').classes()).toContain('ui-button-no-scale')
    await slider.trigger('pointerleave')
    expect(wrapper.get('.discrete-slider-thumb').classes()).not.toContain('is-hovered')
    expect(wrapper.findAll('.discrete-slider-tick.is-hovered')).toHaveLength(0)
    await slider.trigger('pointermove', { pointerType: 'touch', clientX: 114 })
    expect(wrapper.findAll('.discrete-slider-tick.is-hovered')).toHaveLength(0)
  })
  it('打开后默认展示推理强度滑杆，点击当前模型才进入模型列表', async () => {
    const { wrapper } = await mountSelector()
    await openMenu(wrapper)

    expect(wrapper.get('[data-page="2"]').attributes('inert')).toBeDefined()
    expect(wrapper.get('[data-page="2"]').attributes('aria-hidden')).toBe('true')
    expect(wrapper.find('.model-selector-effort-heading').exists()).toBe(false)
    expect(wrapper.get('.model-selector-current-model').text()).toBe('Model A')
    expect(wrapper.get('.model-selector-current-effort').text()).toBe('中')
    expect(wrapper.get('.model-selector-model-entry').text()).toContain('Model A')
    expect(wrapper.get('.model-selector-model-entry').text()).toContain('中')
    expect(wrapper.get('[role="dialog"]').isVisible()).toBe(true)
    expect(wrapper.get('[role="dialog"]').attributes('aria-label')).toBe('模型与思考强度')
    expect(wrapper.get('button[aria-controls^="dropdown-menu-"]').attributes('aria-haspopup')).toBe(
      'dialog'
    )

    const slider = wrapper.get<HTMLInputElement>('.discrete-slider-input')
    expect(slider.attributes('min')).toBe('0')
    expect(slider.attributes('max')).toBe('2')
    expect(slider.element.value).toBe('1')
    expect(slider.attributes('aria-valuetext')).toBe('中')
    expect(document.activeElement).toBe(wrapper.get('.model-selector-model-entry').element)

    await wrapper.get('.model-selector-model-entry').trigger('click')
    await nextTick()

    const leavingEffortPage = wrapper.get('.panel-switcher__page[aria-hidden="true"][inert]')
    expect(leavingEffortPage.find('.discrete-slider-input').exists()).toBe(true)
    expect(wrapper.findAll('.model-selector-page')).toHaveLength(2)

    const modelItems = wrapper.findAll('.model-selector-model-item')
    expect(modelItems).toHaveLength(2)
    expect(modelItems.map(item => item.text())).toEqual(['Model A', 'Model B'])
    expect(document.activeElement).toBe(modelItems[0].element)

    expect(wrapper.get('.model-selector-model-list').attributes('role')).toBe('radiogroup')
    expect(modelItems.every(item => item.attributes('role') === 'radio')).toBe(true)
    expect(modelItems.map(item => item.attributes('tabindex'))).toEqual(['0', '-1'])

    await wrapper.get('.model-selector-back').trigger('click')
    await nextTick()

    const leavingModelsPage = wrapper.get('.panel-switcher__page[aria-hidden="true"][inert]')
    expect(leavingModelsPage.findAll('.model-selector-model-item')).toHaveLength(2)
    expect(document.activeElement?.classList.contains('model-selector-model-entry')).toBe(true)
  })

  it('列表关闭时不切回滑杆造成淡出跳高，重开才重置且不保存配置', async () => {
    const { wrapper, chatStore } = await mountSelector()
    const save = vi.spyOn(chatStore, 'applySessionModelConfig')
    await openMenu(wrapper)
    await wrapper.get('.model-selector-model-entry').trigger('click')
    expect(wrapper.get('.panel-switcher').attributes('data-current-page')).toBe('2')

    await wrapper.get('button[aria-controls^="dropdown-menu-"]').trigger('click')
    expect(wrapper.get('.panel-switcher').attributes('data-current-page')).toBe('2')
    expect(wrapper.findAll('.panel-switcher__page[inert]')).toHaveLength(2)

    await openMenu(wrapper)
    expect(wrapper.get('.panel-switcher').attributes('data-current-page')).toBe('1')
    expect(wrapper.get('[data-page="1"]').attributes('inert')).toBeUndefined()
    expect(wrapper.get('[data-page="2"]').attributes('inert')).toBeDefined()
    expect(save).not.toHaveBeenCalled()
  })

  it('模型单选组用方向键移动并选择，Esc 关闭后焦点回到触发器', async () => {
    const { chatStore, wrapper } = await mountSelector()
    await openMenu(wrapper)
    await wrapper.get('.model-selector-model-entry').trigger('click')
    await nextTick()

    const modelItems = wrapper.findAll('.model-selector-model-item')
    expect(document.activeElement).toBe(modelItems[0].element)

    const arrowEvent = new KeyboardEvent('keydown', {
      key: 'ArrowDown',
      bubbles: true,
      cancelable: true,
    })
    modelItems[0].element.dispatchEvent(arrowEvent)
    await flushPromises()
    await nextTick()

    expect(arrowEvent.defaultPrevented).toBe(true)
    expect(chatStore.draftConfig?.modelInfo?.model).toBe('model-b')
    expect(document.activeElement).toBe(wrapper.findAll('.model-selector-model-item')[1].element)
    expect(
      wrapper.findAll('.model-selector-model-item').map(item => item.attributes('tabindex'))
    ).toEqual(['-1', '0'])

    const escapeEvent = new KeyboardEvent('keydown', {
      key: 'Escape',
      bubbles: true,
      cancelable: true,
    })
    document.activeElement?.dispatchEvent(escapeEvent)
    await nextTick()

    expect(wrapper.find('[role="dialog"]').isVisible()).toBe(false)
    expect(document.activeElement).toBe(
      wrapper.get('button[aria-controls^="dropdown-menu-"]').element
    )
  })

  it('当前模型已不在目录时进入模型页仍聚焦首项并可切换', async () => {
    const { chatStore, wrapper } = await mountSelector()
    chatStore.setDraftConfig({
      reasoningEffort: 'medium',
      modelInfo: {
        id: 99,
        model: 'retired-model',
        modelName: 'Retired Model',
        capabilities: {
          reasoningControl: { levels: ['medium'], defaultLevel: 'medium' },
        },
      },
    })
    await flushPromises()
    await openMenu(wrapper)
    await wrapper.get('.model-selector-model-entry').trigger('click')
    await nextTick()

    let modelItems = wrapper.findAll('.model-selector-model-item')
    expect(modelItems.every(item => item.attributes('aria-checked') === 'false')).toBe(true)
    expect(modelItems.map(item => item.attributes('tabindex'))).toEqual(['0', '-1'])
    expect(document.activeElement).toBe(modelItems[0].element)

    await modelItems[0].trigger('keydown', { key: 'ArrowRight' })
    await flushPromises()
    await nextTick()

    modelItems = wrapper.findAll('.model-selector-model-item')
    expect(chatStore.draftConfig?.modelInfo?.model).toBe('model-b')
    expect(document.activeElement).toBe(modelItems[1].element)
  })

  it('快速连续方向键切换会串行保存，旧请求失败不覆盖最终选择或焦点', async () => {
    const { chatStore, wrapper } = await mountSelector()
    const modelCatalogStore = useModelCatalogStore()
    modelCatalogStore.modelList = [
      ...MODEL_OPTIONS,
      {
        id: 3,
        model: 'model-c',
        modelName: 'Model C',
        capabilities: {
          reasoningControl: { levels: ['medium'], defaultLevel: 'medium' },
        },
      },
    ]
    await nextTick()

    let releaseFirst!: () => void
    let releaseSecond!: () => void
    const firstGate = new Promise<void>(resolve => {
      releaseFirst = resolve
    })
    const secondGate = new Promise<void>(resolve => {
      releaseSecond = resolve
    })
    let activeWrites = 0
    let maxActiveWrites = 0
    const savedModels: string[] = []
    vi.spyOn(chatStore, 'applySessionModelConfig').mockImplementation(async config => {
      const callIndex = savedModels.length
      savedModels.push(config.modelInfo.model)
      activeWrites += 1
      maxActiveWrites = Math.max(maxActiveWrites, activeWrites)
      try {
        await (callIndex === 0 ? firstGate : secondGate)
        if (callIndex === 0) throw new Error('first save failed')
        chatStore.setDraftConfig(config)
        return true
      } finally {
        activeWrites -= 1
      }
    })

    await openMenu(wrapper)
    await wrapper.get('.model-selector-model-entry').trigger('click')
    await nextTick()
    let modelItems = wrapper.findAll('.model-selector-model-item')

    modelItems[0].element.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true })
    )
    modelItems[1].element.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true })
    )
    await nextTick()

    expect(savedModels).toEqual(['model-b'])
    expect(document.activeElement).toBe(modelItems[2].element)

    releaseFirst()
    await flushPromises()
    expect(savedModels).toEqual(['model-b', 'model-c'])
    expect(maxActiveWrites).toBe(1)

    releaseSecond()
    await flushPromises()
    await nextTick()

    modelItems = wrapper.findAll('.model-selector-model-item')
    expect(chatStore.draftConfig?.modelInfo?.model).toBe('model-c')
    expect(document.activeElement).toBe(modelItems[2].element)
    expect(modelItems.map(item => item.attributes('tabindex'))).toEqual(['-1', '-1', '0'])
  })

  it('排队中的模型选择轮到时已切到别的会话：不保存、不写进别的会话或首页暂存，并提示', async () => {
    const { chatStore, wrapper } = await mountSelector()
    const A = 'g_aaaaaaaaaaaaaaaaaaaaaaaa'
    const B = 'g_bbbbbbbbbbbbbbbbbbbbbbbb'
    const configOf = (model: string) =>
      JSON.stringify({ reasoningEffort: 'medium', modelInfo: { ...MODEL_OPTIONS[0], model } })
    chatStore.groupList = [
      { uuid: A, title: 'A', config: configOf('model-a') },
      { uuid: B, title: 'B', config: configOf('model-a') },
    ] as Chat.ConversationGroup[]
    chatStore.active = A
    const modelCatalogStore = useModelCatalogStore()
    modelCatalogStore.modelList = [
      ...MODEL_OPTIONS,
      {
        id: 3,
        model: 'model-c',
        modelName: 'Model C',
        capabilities: { reasoningControl: { levels: ['medium'], defaultLevel: 'medium' } },
      },
    ]
    let releaseFirst!: () => void
    groupApi.update
      .mockReset()
      .mockImplementationOnce(() => new Promise(resolve => (releaseFirst = () => resolve(true))))
    toasts.warning.mockReset()
    await nextTick()

    await openMenu(wrapper)
    await wrapper.get('.model-selector-model-entry').trigger('click')
    await nextTick()
    const modelItems = wrapper.findAll('.model-selector-model-item')
    // A 里连选两次：第一次在写，第二次排队
    modelItems[0].element.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true })
    )
    modelItems[1].element.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true })
    )
    await flushPromises()
    expect(groupApi.update).toHaveBeenCalledTimes(1)
    expect(groupApi.update.mock.calls[0][0]).toMatchObject({ gid: A })
    expect(groupApi.update.mock.calls[0][0].config).toContain('model-b')

    // 切到 B 之后第一次才写完：排队的那次放弃
    chatStore.active = B
    releaseFirst()
    await flushPromises()
    expect(groupApi.update).toHaveBeenCalledTimes(1)
    expect(toasts.warning).toHaveBeenCalledWith('已切换到别的对话，刚才的模型选择没有保存')
    expect(
      JSON.parse(chatStore.groupList.find(item => item.uuid === B)!.config!).modelInfo.model
    ).toBe('model-a')
    expect(chatStore.draftConfig?.modelInfo?.model).not.toBe('model-c')
  })

  it('首页新对话里的模型选择照常写进暂存', async () => {
    const { chatStore, wrapper } = await mountSelector()
    chatStore.active = ''
    groupApi.update.mockReset()
    await openMenu(wrapper)
    await wrapper.get('.model-selector-model-entry').trigger('click')
    await nextTick()
    await wrapper.findAll('.model-selector-model-item')[1].trigger('click')
    await flushPromises()
    expect(chatStore.draftConfig?.modelInfo?.model).toBe('model-b')
    expect(groupApi.update).not.toHaveBeenCalled()
  })

  it('选模型成功后回到强度页并保持弹层打开，收起后展示新模型', async () => {
    const { chatStore, wrapper } = await mountSelector()
    await openMenu(wrapper)
    await wrapper.get('.model-selector-model-entry').trigger('click')
    await nextTick()

    await wrapper.findAll('.model-selector-model-item')[1].trigger('click')
    await flushPromises()

    expect(chatStore.draftConfig?.modelInfo?.model).toBe('model-b')
    // 新模型仍支持当前 medium 档位时保持用户选择，不强制重置为它的默认 off。
    expect(chatStore.draftConfig?.reasoningEffort).toBe('medium')
    const trigger = wrapper.get('button[aria-controls^="dropdown-menu-"]')
    expect(trigger.attributes('aria-expanded')).toBe('true')
    expect(trigger.text()).toBe('思考强度')
    expect(wrapper.get('.panel-switcher').attributes('data-current-page')).toBe('1')
    expect(wrapper.get('.model-selector-current-model').text()).toBe('Model B')
    expect(wrapper.get('.discrete-slider-input').attributes('max')).toBe('1')
    expect(wrapper.get('.discrete-slider-input').attributes('aria-valuetext')).toBe('中')
    expect(document.activeElement).toBe(wrapper.get('.model-selector-model-entry').element)

    await trigger.trigger('click')
    expect(trigger.text()).toContain('Model B')
    expect(trigger.text()).toContain('中')
  })

  it('选模型失败仍停在列表，不误返回强度页', async () => {
    const { chatStore, wrapper } = await mountSelector()
    vi.spyOn(chatStore, 'applySessionModelConfig').mockResolvedValue(false)
    await openMenu(wrapper)
    await wrapper.get('.model-selector-model-entry').trigger('click')
    await wrapper.findAll('.model-selector-model-item')[1].trigger('click')
    await flushPromises()

    expect(chatStore.draftConfig?.modelInfo?.model).toBe('model-a')
    expect(wrapper.get('.panel-switcher').attributes('data-current-page')).toBe('2')
    expect(wrapper.get('[role="dialog"]').isVisible()).toBe(true)
  })

  it.each(['close', 'reopen', 'back-and-reenter'])(
    '选模型保存期间 %s，迟到结果不会重新打开或打断当前页面',
    async action => {
      const { chatStore, wrapper } = await mountSelector()
      let finish!: () => void
      vi.spyOn(chatStore, 'applySessionModelConfig').mockImplementation(
        config =>
          new Promise<boolean>(resolve => {
            finish = () => {
              chatStore.setDraftConfig(config)
              resolve(true)
            }
          })
      )
      await openMenu(wrapper)
      await wrapper.get('.model-selector-model-entry').trigger('click')
      await wrapper.findAll('.model-selector-model-item')[1].trigger('click')
      await flushPromises()
      const trigger = wrapper.get('button[aria-controls^="dropdown-menu-"]')
      if (action === 'back-and-reenter') {
        await wrapper.get('.model-selector-back').trigger('click')
      } else {
        await trigger.trigger('click')
        if (action === 'reopen') await openMenu(wrapper)
      }
      if (action !== 'close') await wrapper.get('.model-selector-model-entry').trigger('click')

      finish()
      await flushPromises()
      expect(trigger.attributes('aria-expanded')).toBe(action === 'close' ? 'false' : 'true')
      expect(wrapper.get('.panel-switcher').attributes('data-current-page')).toBe('2')
      expect(chatStore.draftConfig?.modelInfo?.model).toBe('model-b')
    }
  )

  it('打开与连续调档不替换入口节点、不重复淡出，关闭立即显示最新强度', async () => {
    const { wrapper } = await mountSelector()
    const trigger = wrapper.get('button[aria-controls^="dropdown-menu-"]')
    const label = trigger.get('.model-selector-trigger-label').element
    expect(trigger.text()).toContain('Model A')
    await openMenu(wrapper)
    for (const index of ['0', '1', '2']) {
      const slider = wrapper.get<HTMLInputElement>('.discrete-slider-input')
      slider.element.value = index
      await slider.trigger('input')
      await slider.trigger('change')
      await flushPromises()
      expect(wrapper.get('.discrete-slider-input').attributes('aria-valuetext')).toBe(
        ['低', '中', '高'][Number(index)]
      )
      expect(trigger.text()).toBe('思考强度')
      expect(trigger.get('.model-selector-trigger-label').element).toBe(label)
    }
    await trigger.trigger('click')
    expect(trigger.get('.model-selector-trigger-label').element).toBe(label)
    expect(trigger.text()).toContain('Model A')
    expect(trigger.get('.model-selector-trigger-effort').text()).toBe('高')
  })

  it('推理强度滑杆使用离散档位并在 change 时写回当前配置，菜单保持打开', async () => {
    const { chatStore, wrapper } = await mountSelector()
    await openMenu(wrapper)

    const slider = wrapper.get<HTMLInputElement>('.discrete-slider-input')
    slider.element.value = '2'
    await slider.trigger('input')
    expect(slider.attributes('aria-valuetext')).toBe('高')
    expect(wrapper.get('.model-selector-current-effort').text()).toBe('高')

    await slider.trigger('change')
    await flushPromises()
    expect(chatStore.draftConfig?.reasoningEffort).toBe('high')
    expect(wrapper.get('[role="dialog"]').isVisible()).toBe(true)
    expect(wrapper.get('.discrete-slider-input').attributes('aria-valuetext')).toBe('高')
  })

  it('当前模型只有一个真实档位时显示单点并禁用滑杆', async () => {
    const { wrapper, chatStore } = await mountSelector()
    chatStore.setDraftConfig({
      reasoningEffort: 'medium',
      modelInfo: {
        id: 3,
        model: 'model-single',
        modelName: 'Model Single',
        capabilities: {
          reasoningControl: { levels: ['medium'], defaultLevel: 'medium' },
        },
      },
    })
    await flushPromises()
    await nextTick()
    await openMenu(wrapper)

    const slider = wrapper.get<HTMLInputElement>('.discrete-slider-input')
    expect(slider.element.disabled).toBe(true)
    expect(wrapper.findAll('.discrete-slider-tick')).toHaveLength(1)
    expect(slider.attributes('aria-valuetext')).toBe('中')
  })

  it('拖动位置连续跟随，松手才吸附到最近档位并保存一次', async () => {
    const { wrapper, chatStore } = await mountSelector()
    await openMenu(wrapper)
    const save = vi.spyOn(chatStore, 'applySessionModelConfig')
    const slider = wrapper.get<HTMLInputElement>('.discrete-slider-input')
    vi.spyOn(slider.element, 'getBoundingClientRect').mockReturnValue({
      left: 100,
      width: 228,
    } as DOMRect)
    slider.element.setPointerCapture = vi.fn()
    slider.element.releasePointerCapture = vi.fn()

    await slider.trigger('pointerdown', { pointerId: 1, button: 0, clientX: 214 })
    await slider.trigger('pointermove', { pointerId: 1, clientX: 284 })
    const shell = wrapper.get('.discrete-slider-shell')
    expect(shell.classes()).toContain('is-dragging')
    expect(shell.attributes('style')).toContain(`${((284 - 100 - 13) / (228 - 26)) * 100}%`)
    expect(slider.attributes('aria-valuetext')).toBe('高')
    expect(chatStore.draftConfig?.reasoningEffort).toBe('medium')
    expect(save).not.toHaveBeenCalled()

    // A second contact must not take over the active gesture.
    await slider.trigger('pointerdown', { pointerId: 2, button: 0, clientX: 114 })
    await slider.trigger('pointermove', { pointerId: 2, clientX: 114 })
    expect(shell.attributes('style')).toContain(`${((284 - 100 - 13) / (228 - 26)) * 100}%`)

    await slider.trigger('pointerup', { pointerId: 1, clientX: 284 })
    await flushPromises()
    expect(shell.classes()).not.toContain('is-dragging')
    expect(shell.attributes('style')).toContain('100%')
    expect(slider.element.releasePointerCapture).toHaveBeenCalledWith(1)
    expect(chatStore.draftConfig?.reasoningEffort).toBe('high')
    expect(save).toHaveBeenCalledTimes(1)
  })

  it.each(['pointercancel', 'lostpointercapture', 'close'])(
    '%s 取消拖动预览，不保存尚未提交的档位',
    async action => {
      const { wrapper, chatStore } = await mountSelector()
      await openMenu(wrapper)
      const save = vi.spyOn(chatStore, 'applySessionModelConfig')
      const slider = wrapper.get<HTMLInputElement>('.discrete-slider-input')
      vi.spyOn(slider.element, 'getBoundingClientRect').mockReturnValue({
        left: 100,
        width: 228,
      } as DOMRect)
      slider.element.setPointerCapture = vi.fn()
      await slider.trigger('pointerdown', { pointerId: 1, button: 0, clientX: 314 })
      expect(slider.attributes('aria-valuetext')).toBe('高')
      if (action === 'close') {
        await slider.trigger('keydown', { key: 'Escape' })
      } else {
        await slider.trigger(action, { pointerId: 1 })
      }
      await flushPromises()
      expect(save).not.toHaveBeenCalled()
      expect(chatStore.draftConfig?.reasoningEffort).toBe('medium')
      expect(wrapper.get('.discrete-slider-shell').classes()).not.toContain('is-dragging')
      if (action === 'close') await openMenu(wrapper)
      expect(wrapper.get('.discrete-slider-input').attributes('aria-valuetext')).toBe('中')
    }
  )

  it('七档模型完整渲染首尾刻度，并可从关闭滑到最高', async () => {
    const { wrapper, chatStore } = await mountSelector({
      reasoningEffort: 'off',
      reasoningLevels: ALL_REASONING_LEVELS,
    })
    await openMenu(wrapper)

    const slider = wrapper.get<HTMLInputElement>('.discrete-slider-input')
    const ticks = wrapper.findAll<HTMLElement>('.discrete-slider-tick')
    expect(slider.attributes('max')).toBe('6')
    expect(slider.element.value).toBe('0')
    expect(ticks).toHaveLength(7)
    expect(ticks[0].element.style.left).toContain('13px')
    expect(ticks[0].element.style.left).toContain('0%')
    expect(ticks[6].element.style.left).toContain('100%')
    expect(ticks[6].element.style.left).toContain('26px')

    slider.element.value = '6'
    await slider.trigger('input')
    expect(slider.attributes('aria-valuetext')).toBe('最高')
    expect(wrapper.get('.discrete-slider-shell').attributes('style')).toContain(
      '--reasoning-position: calc(13px + 100% - 26px)'
    )

    await slider.trigger('change')
    await flushPromises()
    expect(chatStore.draftConfig?.reasoningEffort).toBe('max')
  })

  it('触发器分别保留长模型名截断区与不可收缩的强度，并暴露完整可访问名称', async () => {
    const { wrapper } = await mountSelector({
      modelName: 'A Very Long Model Name That Must Not Hide Effort',
      reasoningEffort: 'high',
    })

    const trigger = wrapper.get('button[aria-controls^="dropdown-menu-"]')
    expect(trigger.get('.model-selector-trigger-model').text()).toContain('A Very Long Model Name')
    expect(trigger.get('.model-selector-trigger-effort').text()).toBe('高')
    expect(trigger.attributes('aria-label')).toContain(
      'A Very Long Model Name That Must Not Hide Effort'
    )
    expect(trigger.attributes('aria-label')).toContain('高')
  })

  it('关闭档在外部触发器与默认页中使用弱状态样式', async () => {
    const { wrapper } = await mountSelector({
      modelIndex: 1,
      reasoningEffort: 'off',
    })

    expect(wrapper.get('.model-selector-trigger-effort').classes()).toContain('is-off')
    await openMenu(wrapper)
    expect(wrapper.get('.model-selector-current-effort').classes()).toContain('is-off')
    expect(wrapper.get('.model-selector-model-entry').attributes('aria-label')).toContain('关闭')
  })

  it('移动端共用紧凑滑杆，触摸拖动松手提交，点击模型名后才展示模型列表', async () => {
    layoutState.state!.isMobile = true
    const { wrapper, chatStore } = await mountSelector()
    const trigger = wrapper.get('button[aria-controls^="dropdown-menu-"]')
    expect(trigger.attributes('aria-haspopup')).toBe('dialog')
    await openMenu(wrapper)
    expect(document.querySelector('.mobile-context-sheet')).toBeNull()
    expect(wrapper.get('[data-page="2"]').attributes('inert')).toBeDefined()
    expect(wrapper.get('[data-page="2"]').attributes('aria-hidden')).toBe('true')
    const slider = wrapper.get<HTMLInputElement>('.discrete-slider-input')
    slider.element.setPointerCapture = vi.fn()
    slider.element.releasePointerCapture = vi.fn()
    vi.spyOn(slider.element, 'getBoundingClientRect').mockReturnValue({
      left: 20,
      width: 228,
    } as DOMRect)
    await slider.trigger('pointerdown', {
      pointerId: 7,
      pointerType: 'touch',
      button: 0,
      clientX: 134,
    })
    await slider.trigger('pointermove', { pointerId: 7, pointerType: 'touch', clientX: 234 })
    expect(chatStore.draftConfig?.reasoningEffort).toBe('medium')
    await slider.trigger('pointerup', { pointerId: 7, pointerType: 'touch', clientX: 234 })
    await flushPromises()
    expect(chatStore.draftConfig?.reasoningEffort).toBe('high')
    expect(wrapper.get('[role="dialog"]').isVisible()).toBe(true)
    await wrapper.get('.model-selector-model-entry').trigger('click')
    await wrapper.findAll('.model-selector-model-item')[1].trigger('click')
    await flushPromises()
    expect(chatStore.draftConfig?.modelInfo?.model).toBe('model-b')
    expect(trigger.attributes('aria-expanded')).toBe('true')
    expect(trigger.text()).toBe('思考强度')
    expect(wrapper.get('.panel-switcher').attributes('data-current-page')).toBe('1')
    expect(wrapper.get('.discrete-slider-input').attributes('aria-valuetext')).toBe('关闭')
  })

  it('桌面模型菜单跨到移动端再返回时保持关闭', async () => {
    const { wrapper } = await mountSelector()
    await openMenu(wrapper)

    expect(wrapper.get('[role="dialog"]').isVisible()).toBe(true)

    layoutState.state!.isMobile = true
    await nextTick()
    await nextTick()

    expect(wrapper.get('button[aria-controls^="dropdown-menu-"]').attributes('aria-expanded')).toBe(
      'false'
    )

    layoutState.state!.isMobile = false
    await nextTick()
    await nextTick()

    const desktopTrigger = wrapper.get('button[aria-controls^="dropdown-menu-"]')
    expect(desktopTrigger.attributes('aria-expanded')).toBe('false')
    expect(wrapper.get('[role="dialog"]').isVisible()).toBe(false)
  })
})
