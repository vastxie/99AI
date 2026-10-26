<script setup lang="ts">
import { ArrowLeft } from '@lucide/vue'
import { onMounted, ref } from 'vue'
import UiButton from '@/components/common/UiButton.vue'
import UiTooltip from '@/components/common/UiTooltip.vue'
import { t } from '@/locales'

/**
 * 设置里子视图（改密码、绑定登录方式、扩展包的面板）的返回头：返回键 + 标题。
 * 进入子视图时焦点落到标题上，读屏从新视图的开头读；返回后焦点落到哪里由外层决定。
 */
defineProps<{ title: string }>()
const emit = defineEmits<{ back: [] }>()
const titleRef = ref<HTMLElement | null>(null)

onMounted(() => titleRef.value?.focus())
</script>

<template>
  <div class="mb-4 flex items-center border-b border-app-divider pb-2">
    <UiTooltip class="mr-2" :text="t('common.back')" placement="bottom">
      <UiButton
        icon
        type="button"
        class="fg-quiet"
        :aria-label="t('common.back')"
        @click="emit('back')"
      >
        <ArrowLeft :size="18" />
      </UiButton>
    </UiTooltip>
    <h3 ref="titleRef" tabindex="-1" class="settings-section-title">{{ title }}</h3>
  </div>
</template>
