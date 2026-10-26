<script lang="ts" setup>
import DropdownMenu, { MenuItem } from '@/components/common/DropdownMenu'
import UiButton from '@/components/common/UiButton.vue'
import DiscreteSlider from '@/components/common/DiscreteSlider.vue'
import PanelSwitcher from '@/components/common/PanelSwitcher.vue'
import ModelAvatar from '@/components/common/ModelAvatar/index.vue'
import { useViewport } from '@/hooks/useViewport'
import { Check, ChevronDown, ChevronLeft, ChevronRight } from '@lucide/vue'
import { computed, nextTick, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { chatDataEpoch, useChatStore } from '@/store/modules/chat'
import { isConversationId } from '@/constants/conversation'
import { useModelCatalogStore } from '@/store/modules/modelCatalog'
import { message } from '@/utils/message'
import {
  getModelReasoningControl,
  getReasoningLevelLabel,
  REASONING_LEVEL_OPTIONS,
  resolveReasoningEffort,
} from '@/utils/reasoning'

interface Props {
  triggerClass?: string
  menuPosition?: 'bottom-left' | 'top-left' | 'bottom-right' | 'top-right'
}

const Props = withDefaults(defineProps<Props>(), {
  triggerClass: '',
  menuPosition: 'top-left',
})

const { t } = useI18n()
const ms = message()
const chatStore = useChatStore()
const modelCatalogStore = useModelCatalogStore()
const { isMobile } = useViewport()

const isMenuOpen = ref(false)
const activePanel = ref<'models' | null>(null)
const menuShellRef = ref<HTMLElement>()
const reasoningSliderIndex = ref(0)
const modelOptions = ref<any[]>([])

// 与发送链路共用 store 的生效配置，避免显示与实际发送的模型不一致
const configObj = computed(() => chatStore.effectiveModelConfig)
const notSwitchModel = computed(() => {
  return configObj.value?.modelInfo?.isFixedModel === 1
})

const shouldShowSelector = computed(() => {
  return modelOptions.value.length > 0 && !notSwitchModel.value
})

const currentModelCapabilities = computed(() => configObj.value?.modelInfo?.capabilities || {})

const reasoningOptions = computed(() => {
  const { levels } = getModelReasoningControl(currentModelCapabilities.value)
  return REASONING_LEVEL_OPTIONS.filter(item => levels.includes(item.value))
})

const currentReasoningEffort = computed<Chat.ReasoningEffort>(() => {
  return resolveReasoningEffort(configObj.value?.reasoningEffort, currentModelCapabilities.value)
})

const currentReasoningLabel = computed(() => getReasoningLevelLabel(currentReasoningEffort.value))

const desktopTriggerLabel = computed(() =>
  t('chat.modelTriggerLabel', {
    model: configObj.value?.modelInfo?.modelName || t('common.selectModel'),
    effort: currentReasoningLabel.value,
  })
)

const sliderReasoningOption = computed(
  () => reasoningOptions.value[reasoningSliderIndex.value] ?? reasoningOptions.value[0]
)

const sliderReasoningLabel = computed(() =>
  sliderReasoningOption.value
    ? getReasoningLevelLabel(sliderReasoningOption.value.value)
    : currentReasoningLabel.value
)

const savedReasoningIndex = computed(() =>
  Math.max(
    0,
    reasoningOptions.value.findIndex(item => item.value === currentReasoningEffort.value)
  )
)
const sliderOptions = computed(() =>
  reasoningOptions.value.map(item => ({
    value: item.value,
    label: getReasoningLevelLabel(item.value),
  }))
)

const selectedModelIndex = computed(() => {
  const index = modelOptions.value.findIndex(
    item => item.value === configObj.value?.modelInfo?.model
  )
  return Math.max(0, index)
})

function queryModelList() {
  // 从 modelCatalogStore.modelList 读取已加载的模型数据
  const allModels = (modelCatalogStore.modelList || []) as any[]

  modelOptions.value = allModels.map((model: any) => ({
    id: model.id,
    label: model.modelName,
    value: model.model,
    deduct: model.deduct,
    multimodalTypes: model.multimodalTypes || [],
    protocol: model.protocol,
    capabilities: model.capabilities || {},
    modelAvatar: model.modelAvatar,
    modelDescription: model.modelDescription,
    maxModelTokens: model.maxModelTokens,
  }))
}

/**
 * 提交一次配置改动：有会话就写回该会话自身的 config（乐观更新 + 失败回滚），
 * 尚未建组时才落全局暂存。详见 store 的 applySessionModelConfig。
 */
type ConfigWriteResult = { applied: boolean; isLatest: boolean }
let configWriteTail: Promise<void> = Promise.resolve()
let configWriteRevision = 0

/** 当前会话；首页新对话为空串 */
const currentWorkspaceId = () => (isConversationId(chatStore.active) ? chatStore.active : '')

async function applyConfig(buildConfig: () => any): Promise<ConfigWriteResult> {
  const revision = ++configWriteRevision
  // 记下选择发生在哪个会话：排队轮到时已经换了会话（含身份变化后清空），就放弃这次保存并提示，
  // 不能按那时的当前会话去写（会把 A 里的选择写进 B）
  const workspaceId = currentWorkspaceId()
  // 首页的空串换身份后仍是空串：再记下会话数据代次，身份换了就静默放弃（不写进新身份的首页暂存）
  const epoch = chatDataEpoch()
  const operation = configWriteTail.then(async () => {
    if (chatDataEpoch() !== epoch) return false
    if (currentWorkspaceId() !== workspaceId) {
      ms.warning(t('chat.modelChoiceNotSaved'))
      return false
    }
    try {
      const applied = await chatStore.applySessionModelConfig(buildConfig(), { workspaceId })
      return applied !== false
    } catch {
      if (chatDataEpoch() === epoch) ms.error(t('chat.updateConversationFailed'))
      return false
    }
  })
  configWriteTail = operation.then(() => undefined)
  const applied = await operation
  return { applied, isLatest: revision === configWriteRevision }
}

function switchReasoningEffort(value: Chat.ReasoningEffort) {
  // 必须以「生效配置」为底，否则会话组的空配置会写出无模型的配置，档位被全链路丢弃
  void applyConfig(() => ({
    ...configObj.value,
    reasoningEffort: resolveReasoningEffort(value, currentModelCapabilities.value),
  }))
}

async function focusMenuItem(selector: string) {
  await nextTick()
  menuShellRef.value?.querySelector<HTMLElement>(selector)?.focus()
}

function syncReasoningSlider() {
  const currentIndex = reasoningOptions.value.findIndex(
    item => item.value === currentReasoningEffort.value
  )
  reasoningSliderIndex.value = Math.max(0, currentIndex)
}

function commitReasoningSlider(index: number) {
  const option = reasoningOptions.value[index]
  if (option && option.value !== currentReasoningEffort.value) switchReasoningEffort(option.value)
}

function openModelPanel() {
  activePanel.value = 'models'
  void focusMenuItem(
    '.model-selector-model-item[aria-checked="true"], .model-selector-model-item[tabindex="0"]'
  )
}

function closeModelPanel() {
  activePanel.value = null
  void focusMenuItem('.model-selector-model-entry')
}

// 保存完成后只返回发起选择的那一页，不打断关闭、重开或手动返回后的操作。
let menuViewRevision = 0
watch([isMenuOpen, activePanel], () => menuViewRevision++, { flush: 'sync' })

async function selectModelAndReturn(option: any) {
  const viewRevision = menuViewRevision
  const result = await switchModel(option)
  if (
    result.applied &&
    result.isLatest &&
    isMenuOpen.value &&
    activePanel.value === 'models' &&
    viewRevision === menuViewRevision
  ) {
    closeModelPanel()
  }
}

async function handleModelRadioKeydown(event: KeyboardEvent, index: number) {
  const keys = ['ArrowDown', 'ArrowRight', 'ArrowUp', 'ArrowLeft', 'Home', 'End']
  if (!keys.includes(event.key) || modelOptions.value.length === 0) return

  event.preventDefault()
  let nextIndex = index
  if (event.key === 'Home') {
    nextIndex = 0
  } else if (event.key === 'End') {
    nextIndex = modelOptions.value.length - 1
  } else if (event.key === 'ArrowDown' || event.key === 'ArrowRight') {
    nextIndex = (index + 1) % modelOptions.value.length
  } else {
    nextIndex = (index - 1 + modelOptions.value.length) % modelOptions.value.length
  }

  menuShellRef.value?.querySelector<HTMLElement>(`[data-model-index="${nextIndex}"]`)?.focus()
  const result = await switchModel(modelOptions.value[nextIndex])
  await nextTick()
  if (!result.isLatest) return
  const focusIndex = selectedModelIndex.value
  menuShellRef.value?.querySelector<HTMLElement>(`[data-model-index="${focusIndex}"]`)?.focus()
}

async function switchModel(option: any) {
  return applyConfig(() => {
    // 与 configObj / switchReasoningEffort 同源；进入串行写队列后再取最新配置，避免快速切换用旧值覆盖。
    const currentConfig = configObj.value
    const { modelInfo } = currentConfig
    const { isFixedModel } = modelInfo || {}

    return {
      ...currentConfig,
      reasoningEffort: resolveReasoningEffort(currentReasoningEffort.value, option.capabilities),
      modelInfo: {
        id: option.id,
        modelName: option.label || '',
        model: option.value,
        deduct: option.deduct,
        multimodalTypes: option.multimodalTypes || [],
        protocol: option.protocol,
        capabilities: option.capabilities || {},
        modelAvatar: option.modelAvatar || '',
        isFixedModel: isFixedModel || false,
        modelDescription: option.modelDescription || '',
        maxModelTokens: option.maxModelTokens,
      },
    }
  })
}

watch(
  [() => chatStore.activeConfig, () => modelCatalogStore.modelList],
  () => {
    queryModelList()
  },
  { immediate: true }
)

watch(isMenuOpen, value => {
  if (value) {
    activePanel.value = null
    syncReasoningSlider()
  }
})

watch([reasoningOptions, currentReasoningEffort], syncReasoningSlider, { immediate: true })

watch(isMobile, () => {
  isMenuOpen.value = false
})
</script>

<template>
  <template v-if="shouldShowSelector">
    <DropdownMenu
      v-model="isMenuOpen"
      class="max-w-full"
      :anchor-selector="isMobile ? '.chat-footer-input-shell' : undefined"
      :position="menuPosition"
      max-height="none"
      min-width="7.25rem"
      menu-class="model-selector-menu"
      content-role="dialog"
      :content-aria-label="t('chat.modelAndReasoning')"
      teleport
    >
      <template #trigger="{ triggerProps }">
        <UiButton
          pill
          :scale="false"
          v-bind="triggerProps"
          type="button"
          :class="[triggerClass || 'model-selector-trigger inline-flex items-center gap-1.5']"
          :aria-label="desktopTriggerLabel"
        >
          <span class="model-selector-trigger-label">
            <span v-if="isMenuOpen">{{ t('chat.reasoningEffort') }}</span>
            <template v-else>
              <span class="model-selector-trigger-model">
                <bdi>{{ configObj?.modelInfo?.modelName || t('common.selectModel') }}</bdi>
              </span>
              <span
                class="model-selector-trigger-effort"
                :class="{ 'is-off': currentReasoningEffort === 'off' }"
              >
                {{ currentReasoningLabel }}
              </span>
            </template>
          </span>
          <ChevronDown
            :class="{ 'is-open': isMenuOpen }"
            :size="14"
            class="model-selector-trigger-chevron flex-shrink-0"
            aria-hidden="true"
          />
        </UiButton>
      </template>
      <template #menu>
        <div ref="menuShellRef" class="model-selector-menu-shell">
          <PanelSwitcher :page="activePanel === null ? 1 : 2" :active="isMenuOpen">
            <template #first>
              <div
                class="model-selector-page model-selector-effort-page"
                :aria-label="t('chat.reasoningEffort')"
              >
                <UiButton
                  :scale="false"
                  type="button"
                  class="model-selector-model-entry"
                  :aria-label="
                    t('chat.modelTriggerLabel', {
                      model: configObj?.modelInfo?.modelName || t('common.selectModel'),
                      effort: sliderReasoningLabel,
                    })
                  "
                  @click.stop="openModelPanel"
                >
                  <span class="model-selector-current-model">
                    {{ configObj?.modelInfo?.modelName || t('common.selectModel') }}
                  </span>
                  <span
                    class="model-selector-current-effort"
                    :class="{
                      'is-off': (sliderReasoningOption?.value || currentReasoningEffort) === 'off',
                    }"
                    aria-live="polite"
                  >
                    {{ sliderReasoningLabel }}
                  </span>
                  <ChevronRight
                    :size="17"
                    class="model-selector-entry-chevron shrink-0"
                    aria-hidden="true"
                  />
                </UiButton>

                <DiscreteSlider
                  :model-value="savedReasoningIndex"
                  :options="sliderOptions"
                  :label="t('chat.reasoningEffort')"
                  :active="isMenuOpen && activePanel === null"
                  @preview="reasoningSliderIndex = $event"
                  @change="commitReasoningSlider"
                />
              </div>
            </template>
            <template #second>
              <div class="model-selector-page">
                <MenuItem
                  type="button"
                  role="button"
                  class="model-selector-item model-selector-back"
                  :aria-label="t('chat.backToModels')"
                  @click.stop="closeModelPanel"
                >
                  <template #icon
                    ><ChevronLeft
                      :size="16"
                      class="model-selector-chevron flex-shrink-0"
                      aria-hidden="true"
                  /></template>
                  <span class="model-selector-item-content">
                    <span class="model-selector-item-title">{{ t('common.selectModel') }}</span>
                  </span>
                </MenuItem>

                <div class="model-selector-divider" role="separator"></div>

                <div
                  class="model-selector-model-list custom-scrollbar"
                  role="radiogroup"
                  :aria-label="t('chat.model')"
                >
                  <MenuItem
                    v-for="(item, index) in modelOptions"
                    :key="`${item.value}_${index}`"
                    type="button"
                    class="model-selector-item model-selector-model-item"
                    :class="{
                      'model-selector-item-active': configObj?.modelInfo?.model === item.value,
                    }"
                    @click="selectModelAndReturn(item)"
                    role="radio"
                    :aria-checked="configObj?.modelInfo?.model === item.value"
                    :tabindex="index === selectedModelIndex ? 0 : -1"
                    :data-model-index="index"
                    @keydown="handleModelRadioKeydown($event, index)"
                  >
                    <template #icon>
                      <ModelAvatar
                        :model="item.value"
                        :modelAvatar="item.modelAvatar"
                        :modelName="item.label"
                        size="sm"
                      />
                    </template>
                    <div class="model-selector-item-content">
                      <div class="model-selector-item-title">
                        {{ item.label }}
                      </div>
                    </div>
                    <template #suffix
                      ><Transition name="model-selector-check">
                        <Check
                          v-if="configObj?.modelInfo?.model === item.value"
                          :size="16"
                          class="model-selector-check flex-shrink-0"
                          aria-hidden="true"
                        /> </Transition
                    ></template>
                  </MenuItem>
                </div>
              </div>
            </template>
          </PanelSwitcher>
        </div>
      </template>
    </DropdownMenu>
  </template>
</template>
