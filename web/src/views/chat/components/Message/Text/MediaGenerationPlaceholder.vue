<script lang="ts" setup>
import { Film, ImagePlus, Presentation } from '@lucide/vue'
import type { CSSProperties } from 'vue'

const props = defineProps<{
  kind: 'image' | 'video' | 'presentation'
  label: string
  subLabel?: string
  progressPercent?: number
  placeholderStyle?: CSSProperties
}>()

const emit = defineEmits<{
  click: []
}>()
</script>

<template>
  <button
    type="button"
    class="media-generation-placeholder group relative overflow-hidden rounded-lg border bg-agent-placeholder text-left transition-colors"
    :aria-label="props.label"
    :title="props.label"
    :style="props.placeholderStyle"
    @click="emit('click')"
  >
    <div class="media-modern-layer" aria-hidden="true">
      <div class="media-wave-fill">
        <svg
          class="media-wave-svg media-wave-svg-back"
          viewBox="0 0 600 80"
          preserveAspectRatio="none"
        >
          <path
            d="
              M0,40
              C50,2 100,78 150,40
              C200,2 250,78 300,40
              C350,2 400,78 450,40
              C500,2 550,78 600,40
              L600,80
              L0,80
              Z
            "
          />
        </svg>
        <svg
          class="media-wave-svg media-wave-svg-front"
          viewBox="0 0 600 80"
          preserveAspectRatio="none"
        >
          <path
            d="
              M0,42
              C50,8 100,74 150,42
              C200,8 250,74 300,42
              C350,8 400,74 450,42
              C500,8 550,74 600,42
              L600,80
              L0,80
              Z
            "
          />
        </svg>
      </div>
    </div>
    <div class="relative flex h-full w-full items-center justify-center">
      <div class="media-modern-content flex flex-col items-center gap-3">
        <div class="media-progress-mark">
          <div class="media-progress-mark-inner relative flex items-center justify-center">
            <Film v-if="props.kind === 'video'" :size="24" />
            <Presentation v-else-if="props.kind === 'presentation'" :size="24" />
            <ImagePlus v-else :size="24" />
          </div>
        </div>
        <div v-if="props.kind === 'presentation'" class="media-placeholder-copy">
          <div class="media-placeholder-title">{{ props.label }}</div>
          <div v-if="props.subLabel" class="media-placeholder-subtitle">{{ props.subLabel }}</div>
        </div>
      </div>
    </div>
  </button>
</template>

<style scoped>
.media-generation-placeholder {
  --media-neutral-bg: color-mix(in srgb, var(--app-surface) 97%, var(--text-primary) 3%);
  --media-neutral-bg-soft: color-mix(in srgb, var(--app-surface) 98.5%, var(--text-primary) 1.5%);
  --media-neutral-liquid: color-mix(in srgb, var(--app-surface) 93%, var(--text-primary) 7%);
  --media-neutral-liquid-soft: color-mix(in srgb, var(--app-surface) 95%, var(--text-primary) 5%);
  --media-theme-soft: color-mix(in srgb, var(--agent-running) 10%, var(--app-surface) 90%);
  align-self: flex-start;
  width: var(--media-placeholder-width, min(32vh, 28rem, 100%));
  max-width: min(28rem, 100%);
  min-width: min(10rem, 100%);
  aspect-ratio: var(--media-placeholder-aspect-ratio, 1 / 1);
  box-sizing: border-box;
  flex-shrink: 0;
  isolation: isolate;
  border-radius: var(--radius-2xl);
  border-color: color-mix(in srgb, var(--app-border) 45%, transparent);
}

.media-generation-placeholder:hover {
  border-color: color-mix(in srgb, var(--app-border-strong) 58%, transparent);
}

@media (max-width: 767.9px) {
  .media-generation-placeholder {
    min-width: min(8.5rem, 100%);
  }
}

.media-modern-layer {
  position: absolute;
  inset: 0;
  overflow: hidden;
  border-radius: inherit;
  background:
    radial-gradient(
      circle at 50% 44%,
      color-mix(in srgb, var(--app-surface) 72%, transparent),
      transparent 42%
    ),
    linear-gradient(180deg, var(--media-neutral-bg-soft), var(--media-neutral-bg));
}

.media-modern-layer::after {
  content: '';
  position: absolute;
  inset: 0;
  border-radius: inherit;
  box-shadow: inset 0 1px 0 color-mix(in srgb, var(--app-surface) 82%, transparent);
  pointer-events: none;
}

.media-wave-fill {
  position: absolute;
  inset-inline: 0;
  bottom: 0;
  height: max(1.35rem, var(--media-progress-percent, 0%));
  color: var(--media-neutral-liquid);
  background:
    linear-gradient(
      180deg,
      color-mix(in srgb, var(--app-surface) 34%, transparent),
      color-mix(in srgb, var(--text-primary) 1.5%, transparent)
    ),
    currentColor;
  opacity: 0.72;
  /* 进度水位慢慢涨上去，不属于界面过渡的时长刻度 */
  transition: height 0.75s var(--motion-easing); /* design-guard-allow */
  pointer-events: none;
}

.media-wave-fill::after {
  content: '';
  position: absolute;
  inset: 0;
  background: linear-gradient(
    180deg,
    color-mix(in srgb, var(--app-surface) 64%, transparent),
    transparent 42%
  );
  opacity: 0.32;
}

.media-wave-svg {
  position: absolute;
  left: 0;
  top: -2.65rem;
  width: 200%;
  height: 2.9rem;
  color: inherit;
  pointer-events: none;
}

.media-wave-svg path {
  fill: currentColor;
}

.media-wave-svg-back {
  color: var(--media-neutral-liquid-soft);
  opacity: 0.46;
  animation: mediaWaveMoveBack 5.4s linear infinite;
}

.media-wave-svg-front {
  opacity: 0.58;
  animation: mediaWaveMoveFront 3.7s linear infinite;
}

.media-modern-content {
  position: relative;
  z-index: 1;
  color: var(--agent-running);
}

.media-progress-mark {
  width: 4.4rem;
  height: 4.4rem;
  border-radius: var(--radius-full);
  padding: 2px;
  background: conic-gradient(
    from -90deg,
    var(--agent-running) var(--media-progress-deg, 0deg),
    color-mix(in srgb, var(--agent-running) 14%, var(--app-border) 86%) 0deg
  );
  box-shadow:
    0 10px 24px color-mix(in srgb, var(--agent-running) 8%, transparent),
    inset 0 0 0 1px color-mix(in srgb, var(--app-surface) 78%, transparent);
}

.media-progress-mark-inner {
  width: 100%;
  height: 100%;
  border-radius: var(--radius-full);
  background: var(--media-theme-soft);
}

.media-placeholder-copy {
  max-width: min(14rem, calc(100% - 1rem));
  text-align: center;
  color: var(--text-primary);
}

.media-placeholder-title {
  font-size: var(--type-body-sm-size);
  font-weight: 600;
  line-height: 1.35;
}

.media-placeholder-subtitle {
  margin-top: 0.15rem;
  font-size: var(--type-caption-size);
  line-height: 1.35;
  color: var(--text-secondary);
}

@keyframes mediaWaveMoveFront {
  from {
    transform: translateX(0);
  }
  to {
    transform: translateX(-50%);
  }
}

@keyframes mediaWaveMoveBack {
  from {
    transform: translateX(-50%);
  }
  to {
    transform: translateX(0);
  }
}

@media (prefers-reduced-motion: reduce) {
  .media-wave-fill {
    transition: none;
  }

  .media-wave-svg,
  .media-wave-svg-back,
  .media-wave-svg-front {
    animation: none;
  }
}
</style>
