<script setup lang="ts">
import { computed, useId } from 'vue'

/**
 * 表单字段：标签、控件、说明与错误。
 *
 * 控件由插槽放入，插槽参数 control 带上 id、aria-describedby、aria-invalid，v-bind 到控件上即可。
 * 错误挂在控件的描述上，不另设 role="alert"：校验没过时表单把焦点移到第一个出错的字段
 * （utils/focus），读屏随字段读出错误，不会读两遍；表单级的失败原因由表单自己用 alert 播报。
 * 错误与说明是同一句（规则本身）时只显示错误，不同时两行都在。
 * 紧凑表单（登录框只放占位文字）可以视觉隐藏标签，读屏仍能读到。
 */
const props = withDefaults(
  defineProps<{
    label: string
    hint?: string
    error?: string
    hideLabel?: boolean
  }>(),
  { hint: '', error: '', hideLabel: false }
)

const id = useId()
const hintId = `${id}-hint`
const errorId = `${id}-error`
const showsHint = computed(() => Boolean(props.hint) && props.error !== props.hint)
const control = computed(() => ({
  id,
  'aria-invalid': props.error ? ('true' as const) : undefined,
  'aria-describedby':
    [showsHint.value && hintId, props.error && errorId].filter(Boolean).join(' ') || undefined,
}))
</script>

<template>
  <div class="ds-form-field">
    <label :for="id" :class="hideLabel ? 'sr-only' : 'ds-form-label'">{{ label }}</label>
    <slot :control="control" />
    <p v-if="showsHint" :id="hintId" class="ds-form-helper">{{ hint }}</p>
    <p v-if="error" :id="errorId" class="ds-form-helper ds-form-error">{{ error }}</p>
  </div>
</template>
