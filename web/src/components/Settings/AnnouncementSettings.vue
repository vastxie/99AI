<script setup lang="ts">
import { useAuthStore } from '@/store/modules/auth'
import SafeMarkdownPreview from '@/components/common/SafeMarkdownPreview.vue'
import { computed, onMounted, watch } from 'vue'
import { useI18n } from 'vue-i18n'

interface Props {
  visible: boolean
  type: 'notice' | 'agreement'
}

const props = defineProps<Props>()
const authStore = useAuthStore()
const { t } = useI18n()

const globalConfig = computed(() => authStore.globalConfig)
const content = computed(() =>
  props.type === 'agreement'
    ? globalConfig.value.agreementInfo || ''
    : globalConfig.value.noticeInfo || ''
)
const hasContent = computed(() => Boolean(content.value.trim()))

function refreshGlobalConfig() {
  return authStore.getGlobalConfig().catch(() => {})
}

watch(
  () => props.visible,
  isVisible => {
    if (isVisible) {
      refreshGlobalConfig()
    }
  }
)

onMounted(() => {
  if (props.visible) {
    refreshGlobalConfig()
  }
})
</script>

<template>
  <div class="px-1 pb-3 pt-1">
    <section class="settings-card">
      <div v-if="hasContent" class="p-4">
        <SafeMarkdownPreview :content="content" class="settings-markdown-preview w-full" />
      </div>

      <div v-else class="settings-field-description px-4 py-6">
        {{ t('common.noData') }}
      </div>
    </section>
  </div>
</template>
