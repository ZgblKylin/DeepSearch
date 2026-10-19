<script setup lang="ts">
/**
 * “正在搜索 ···” 三点动画。
 * 组件本身只做视觉，文案由使用方提供；aria-label 供读屏。
 */
withDefaults(
  defineProps<{
    /** 读屏文案，默认“加载中” */
    label?: string
    size?: 'sm' | 'md'
  }>(),
  { label: '加载中', size: 'md' },
)
</script>

<template>
  <span class="loading-dots" :class="`loading-dots--${size}`" role="status" :aria-label="label">
    <span class="loading-dots__dot" />
    <span class="loading-dots__dot" />
    <span class="loading-dots__dot" />
  </span>
</template>

<style scoped>
.loading-dots {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  color: var(--text-muted);
}

.loading-dots__dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: currentColor;
  animation: loading-bounce 1.1s infinite ease-in-out;
}

.loading-dots__dot:nth-child(2) {
  animation-delay: 0.16s;
}

.loading-dots__dot:nth-child(3) {
  animation-delay: 0.32s;
}

.loading-dots--sm .loading-dots__dot {
  width: 4px;
  height: 4px;
}

@keyframes loading-bounce {
  0%,
  70%,
  100% {
    opacity: 0.35;
    transform: translateY(0);
  }

  35% {
    opacity: 1;
    transform: translateY(-3px);
  }
}
</style>
