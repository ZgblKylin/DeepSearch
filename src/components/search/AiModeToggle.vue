<script setup lang="ts">
import { computed } from 'vue'

import Icon from '@/components/ui/Icon.vue'
import ToggleSwitch from '@/components/ui/ToggleSwitch.vue'
import { useSettings } from '@/stores/settings'

/**
 * AI 模式胶囊开关（PLAN 3.2 / 3.5）。
 *
 * 直接读写 settings.aiMode（持久化）；摘要请求的中止与面板显示由 useAi/AI 面板
 * 监听该设置完成，本组件只负责偏好切换。
 */
const { settings, update } = useSettings()

const enabled = computed(() => settings.aiMode)
const description = computed(() =>
  enabled.value ? 'AI 模式已开启：搜索后自动生成摘要' : 'AI 模式已关闭：只显示搜索结果',
)

function toggle(): void {
  update({ aiMode: !settings.aiMode })
}

function setEnabled(value: boolean): void {
  update({ aiMode: value })
}
</script>

<template>
  <div
    class="ai-mode-toggle"
    :class="{ 'ai-mode-toggle--on': enabled }"
    :title="description"
    @click="toggle"
  >
    <Icon class="ai-mode-toggle__icon" name="sparkles" :size="15" />
    <span class="ai-mode-toggle__text">AI 模式</span>
    <ToggleSwitch
      class="ai-mode-toggle__switch"
      :model-value="enabled"
      label="AI 模式"
      @update:model-value="setEnabled"
      @click.stop
    />
  </div>
</template>

<style scoped>
.ai-mode-toggle {
  display: inline-flex;
  flex: none;
  align-items: center;
  gap: 6px;
  padding: 3px 6px 3px 9px;
  border: 1px solid transparent;
  border-radius: var(--radius-pill);
  color: var(--text-muted);
  cursor: pointer;
  user-select: none;
  transition:
    color var(--transition-fast),
    background-color var(--transition-fast),
    border-color var(--transition-fast);
}

.ai-mode-toggle:hover {
  background: var(--surface-hover);
  color: var(--text-secondary);
}

.ai-mode-toggle--on {
  border-color: var(--brand-soft-strong);
  background: var(--brand-soft);
  color: var(--brand);
}

.ai-mode-toggle--on:hover {
  background: var(--brand-soft-strong);
  color: var(--brand);
}

.ai-mode-toggle__icon {
  flex: none;
}

.ai-mode-toggle__text {
  font-size: var(--text-xs);
  font-weight: 600;
  white-space: nowrap;
}

.ai-mode-toggle__switch {
  transform: scale(0.86);
  transform-origin: center;
}

@media (max-width: 560px) {
  .ai-mode-toggle {
    padding: 3px;
  }

  .ai-mode-toggle__text {
    display: none;
  }
}
</style>
