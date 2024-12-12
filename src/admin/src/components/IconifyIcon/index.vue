<script setup lang="ts">
import { Icon } from '@iconify/vue';
import { computed, useAttrs } from 'vue';

interface Props {
  icon?: string;
}

defineProps<Props>();

const attrs = useAttrs();

const bindAttrs = computed<{ class: string; style: string }>(() => ({
  class: (attrs.class as string) || '',
  style: (attrs.style as string) || 'width: 2em, height: 2em',
}));
</script>

<template>
  <Icon icon="icon" v-bind="bindAttrs" />
</template>
