<script setup lang="ts">
// Keep complete class names visible to Tailwind's source scanner.
const variantClasses = {
  primary: 'btn-primary',
  secondary: 'btn-secondary',
  ghost: 'btn-ghost',
  select: 'btn-ghost',
  danger: 'btn-danger',
} as const

withDefaults(
  defineProps<{
    variant?: 'primary' | 'secondary' | 'ghost' | 'danger' | 'select'
    icon?: boolean
    pill?: boolean
    scale?: boolean
    prominent?: boolean
    disabled?: boolean
    type?: 'button' | 'submit' | 'reset'
  }>(),
  { variant: 'ghost', type: 'button', scale: true }
)
</script>

<template>
  <button
    :type="type"
    :disabled="disabled"
    class="btn ui-button ds-focus-ring"
    :class="[
      variantClasses[variant],
      { 'ui-button-icon': icon, 'ui-button-pill': pill, 'ui-button-prominent': prominent },
      {
        'ui-button-select': variant === 'select',
        'ui-button-no-scale': !scale || variant === 'select',
      },
    ]"
  >
    <slot />
  </button>
</template>
