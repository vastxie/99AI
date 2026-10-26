import { createPinia, setActivePinia } from 'pinia'
import { mount, type VueWrapper } from '@vue/test-utils'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import i18n from '@/locales'
import DiscreteSlider from '@/components/common/DiscreteSlider.vue'
import { useChatStore } from '@/store/modules/chat'
import { useModelCatalogStore } from '@/store/modules/modelCatalog'
import {
  compileDesignSystem,
  computedStyle,
  cssVar,
  installStylesheet,
  mountProbe,
  parseTransitions,
  rootVar,
  toPx,
} from '@/styles/stylesheet.testkit'
import ModelSelector from './index.vue'

const layout = vi.hoisted(() => ({ isMobile: false }))

vi.mock('@/hooks/useViewport', async () => {
  const { computed } = await import('vue')
  return { useViewport: () => ({ isMobile: computed(() => layout.isMobile) }) }
})
vi.mock('@/utils/message', () => ({ message: () => ({ error: vi.fn() }) }))

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
    capabilities: { reasoningControl: { levels: ['off', 'medium'], defaultLevel: 'off' } },
  },
]

let removeStyles: () => void
const wrappers: VueWrapper[] = []

async function mountSelector() {
  const pinia = createPinia()
  setActivePinia(pinia)
  const modelCatalogStore = useModelCatalogStore()
  modelCatalogStore.modelList = MODEL_OPTIONS
  modelCatalogStore.baseConfig = { reasoningEffort: 'medium', modelInfo: { ...MODEL_OPTIONS[0] } }
  useChatStore().setDraftConfig(modelCatalogStore.baseConfig)
  const wrapper = mount(ModelSelector, {
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
  wrappers.push(wrapper)
  await nextTick()
  return wrapper
}

async function openMenu(wrapper: VueWrapper) {
  await wrapper.get('button[aria-controls^="dropdown-menu-"]').trigger('click')
  await nextTick()
  await nextTick()
}

beforeAll(async () => {
  removeStyles = installStylesheet(
    await compileDesignSystem({
      raw: 'btn ui-button menu-items menu-action menu-action-list menu-account account-menu-body menu-select menu-select-list',
    })
  )
})

afterAll(() => {
  removeStyles()
})

beforeEach(() => {
  layout.isMobile = false
})

afterEach(() => {
  wrappers.splice(0).forEach(wrapper => wrapper.unmount())
  document.body.innerHTML = ''
})

describe('模型选择器视觉结构', () => {
  it('入口与弹层里的模型名共用辅助灰，入口受父容器宽度约束', async () => {
    const wrapper = await mountSelector()
    const trigger = wrapper.get('button[aria-controls^="dropdown-menu-"]')
    expect(trigger.classes()).toContain('model-selector-trigger')
    expect(computedStyle(trigger.element).color).toBe(rootVar('--text-secondary'))
    expect(computedStyle(trigger.element).maxWidth).toMatch(/^min\(.*100%\)$/)
    expect(wrapper.get('.menu').classes()).toContain('max-w-full')
    await openMenu(wrapper)
    const current = wrapper.get('.model-selector-current-model')
    expect(computedStyle(current.element).color).toBe(rootVar('--text-secondary'))
    expect(wrapper.find('.model-selector-label-enter-active').exists()).toBe(false)
  })

  it('模型名、强度和箭头属于同一个默认入口，入口沿用控件圆角', async () => {
    const wrapper = await mountSelector()
    await openMenu(wrapper)
    const entry = wrapper.get('button.model-selector-model-entry')
    expect(entry.find('.model-selector-current-model').text()).toBe('Model A')
    expect(entry.find('.model-selector-current-effort').text()).toBe('中')
    expect(entry.find('svg.model-selector-entry-chevron').exists()).toBe(true)
    expect(wrapper.find('.model-selector-effort-heading').exists()).toBe(false)
    expect(entry.classes()).not.toContain('ui-button-pill')
    expect(entry.classes().some(name => name.startsWith('rounded-'))).toBe(false)
    expect(computedStyle(entry.element).borderRadius).toBe(toPx(rootVar('--radius-control')))
    const menu = wrapper.get('[id^="dropdown-menu-"]')
    expect(menu.classes()).toContain('menu-items')
    expect(computedStyle(menu.element).borderRadius).toBe(toPx(rootVar('--radius-popover')))
  })

  it('滑杆页和模型列表页共用公共菜单内边距，不再单独覆盖', async () => {
    const wrapper = await mountSelector()
    await openMenu(wrapper)
    const padding = toPx(rootVar('--menu-content-padding'))
    for (const page of wrapper.findAll('.model-selector-page')) {
      expect(computedStyle(page.element).padding).toBe(padding)
    }
    const actionList = mountProbe('menu-action-list', mountProbe('menu-action menu-items'))
    const accountBody = mountProbe('account-menu-body', mountProbe('menu-account menu-items'))
    const selectList = mountProbe('menu-select-list', mountProbe('menu-select menu-items'))
    for (const container of [actionList, accountBody, selectList]) {
      expect(computedStyle(container).padding).toBe(padding)
    }
  })

  it('滑杆轨道两端为滑块预留同一段内缩，首末刻度落在预留边界上', () => {
    const wrapper = mount(DiscreteSlider, {
      attachTo: document.body,
      props: {
        modelValue: 0,
        label: 'Intensity',
        options: ['low', 'medium', 'high'].map(value => ({ value, label: value })),
      },
    })
    wrappers.push(wrapper)
    const shell = wrapper.element as HTMLElement
    const inset = cssVar(shell, '--slider-end-inset')
    expect(inset).toMatch(/^\d+px$/)
    const position = () => shell.style.getPropertyValue('--reasoning-position')
    expect(position()).toBe(`calc(${inset} + 0% - 0px)`)
    return wrapper.setProps({ modelValue: 2 }).then(() => {
      expect(position()).toBe(`calc(${inset} + 100% - ${parseFloat(inset) * 2}px)`)
      const ticks = wrapper.findAll('.discrete-slider-tick')
      expect(ticks[0].attributes('style')).toContain(`calc(${inset} + 0% - 0px)`)
      expect(ticks[2].attributes('style')).toContain(
        `calc(${inset} + 100% - ${parseFloat(inset) * 2}px)`
      )
    })
  })

  it('长模型名优先截断，强度保持不可收缩', () => {
    const model = mountProbe('model-selector-trigger-model', document.body, 'span')
    const effort = mountProbe('model-selector-trigger-effort', document.body, 'span')
    expect(computedStyle(model).flex).toBe('1 1 auto')
    expect(computedStyle(model).overflow).toBe('hidden')
    expect(computedStyle(model).textOverflow).toBe('ellipsis')
    expect(computedStyle(effort).flex).toBe('0 0 auto')
    expect(computedStyle(effort).whiteSpace).toBe('nowrap')
  })

  it('选中勾标进出使用快速动效档位', () => {
    const entering = mountProbe('model-selector-check-enter-active')
    const transitions = parseTransitions(computedStyle(entering).transition)
    expect(transitions.length).toBeGreaterThan(0)
    for (const item of transitions) {
      expect(item.duration).toBe(rootVar('--motion-duration-xs'))
      expect(item.timing).toBe(rootVar('--motion-easing'))
    }
  })

  it('切页使用公共可变高度容器，两页常驻不替换节点', async () => {
    const wrapper = await mountSelector()
    await openMenu(wrapper)
    const switcher = wrapper.get('.panel-switcher')
    expect(switcher.attributes('data-current-page')).toBe('1')
    const pages = switcher.findAll('.panel-switcher__page').map(page => page.element)
    expect(pages).toHaveLength(2)
    await wrapper.get('.model-selector-model-entry').trigger('click')
    await nextTick()
    expect(switcher.attributes('data-current-page')).toBe('2')
    await wrapper.get('.model-selector-back').trigger('click')
    await nextTick()
    expect(switcher.attributes('data-current-page')).toBe('1')
    expect(switcher.findAll('.panel-switcher__page').map(page => page.element)).toEqual(pages)
  })

  it('滑块定位层固定，只有独立视觉层悬停缩放，不叠加模糊光晕', () => {
    const thumb = mountProbe('discrete-slider-thumb', document.body, 'span')
    const face = mountProbe('discrete-slider-thumb-face', thumb, 'span')
    expect(computedStyle(thumb).transform).toBe('translate(-50%, -50%)')
    expect(computedStyle(thumb).filter).toBe('')
    expect(computedStyle(face).transform).toBe('')
    thumb.classList.add('is-hovered')
    expect(computedStyle(thumb).transform).toBe('translate(-50%, -50%)')
    expect(computedStyle(face).transform).toMatch(/^scale\(1\.\d+\)$/)
    expect(computedStyle(face).filter).toBe('')
  })

  it('手机共用同一个选择器与滑杆，不恢复单独的档位列表', async () => {
    layout.isMobile = true
    const wrapper = await mountSelector()
    await openMenu(wrapper)
    expect(wrapper.findAll('.discrete-slider-input')).toHaveLength(1)
    expect(wrapper.find('.mobile-context-sheet').exists()).toBe(false)
    expect(document.body.querySelector('.mobile-context-sheet')).toBeNull()
    expect(wrapper.get('[role="dialog"]').isVisible()).toBe(true)
  })
})
