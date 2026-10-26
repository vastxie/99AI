<script setup lang="ts">
import { computed, defineAsyncComponent, markRaw, type Component } from 'vue'
import { slotByKey } from '@/packs'
import PlainSourceBlock from './Renderers/PlainSourceBlock.vue'

// 渲染器来自扩展包（preview.renderer 挂载点，按内容类型匹配）；没有登记时统一回退为只读源码
const renderers = new Map<string, Component>()
function rendererFor(contentType: string): Component {
  const contribution = slotByKey('preview.renderer', contentType)
  if (!contribution) return PlainSourceBlock
  let renderer = renderers.get(contribution.id)
  if (!renderer) {
    renderer = markRaw(defineAsyncComponent(contribution.component))
    renderers.set(contribution.id, renderer)
  }
  return renderer
}

const props = defineProps<{
  contentType: string
  content: string
  previewSize?: 'desktop' | 'tablet' | 'mobile'
  compact?: boolean
  editable?: boolean
}>()

type PreviewSize = 'desktop' | 'tablet' | 'mobile'

// 定义事件
const emit = defineEmits<{
  'loading-state-change': [value: boolean]
  'update:preview-size': [value: PreviewSize]
  'update:content': [value: string]
}>()

const rendererKey = computed(() => props.contentType)
const currentComponent = computed(() => rendererFor(props.contentType))
</script>

<template>
  <div class="content-renderer h-full w-full bg-panel-subtle">
    <component
      :is="currentComponent"
      :key="rendererKey"
      :content="content"
      :preview-size="previewSize"
      :compact="compact"
      :editable="contentType === 'html' || contentType === 'svg' ? editable : undefined"
      @update:preview-size="emit('update:preview-size', $event)"
      @update:content="emit('update:content', $event)"
    />
  </div>
</template>
