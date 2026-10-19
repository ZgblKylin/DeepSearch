<script setup lang="ts">
import { computed } from 'vue'

import Icon from '@/components/ui/Icon.vue'
import { statusSuggestion } from '@/lib/errors'
import type { ApiErrorView } from '@/types'

/**
 * 搜索失败状态（PLAN 3.3）：展示错误信息与重试；同一时刻全局错误弹窗已由
 * useSearch 通过 ui.showError 打开，本组件保留页内错误与重试入口。
 */
const props = withDefaults(defineProps<{ error?: ApiErrorView | null }>(), { error: null })

defineEmits<{ retry: [] }>()

const suggestion = computed(() => statusSuggestion(props.error?.status ?? null))
const message = computed(() => props.error?.message || '搜索请求失败，请稍后重试。')
const statusText = computed(() => (props.error?.status == null ? '—' : String(props.error.status)))
const codeText = computed(() => props.error?.code || '—')
</script>

<template>
  <div class="error-state" role="alert">
    <span class="error-state__icon" aria-hidden="true">
      <Icon name="alert-circle" :size="26" />
    </span>
    <h2 class="error-state__title">搜索失败</h2>
    <p class="error-state__message">{{ message }}</p>
    <p class="error-state__meta">HTTP 状态码：{{ statusText }} · 错误码：{{ codeText }}</p>
    <p v-if="suggestion" class="error-state__suggestion">{{ suggestion }}</p>
    <button type="button" class="btn btn--primary btn--sm error-state__retry" @click="$emit('retry')">
      <Icon name="refresh-cw" :size="15" />
      重试
    </button>
  </div>
</template>

<style scoped>
.error-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-16) var(--space-4);
  text-align: center;
}

.error-state__icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 56px;
  height: 56px;
  margin-bottom: var(--space-2);
  border-radius: 50%;
  background: var(--danger-soft);
  color: var(--danger);
}

.error-state__title {
  font-size: var(--text-lg);
  font-weight: 700;
}

.error-state__message {
  max-width: 560px;
  color: var(--text-secondary);
  font-size: var(--text-sm);
  overflow-wrap: anywhere;
}

.error-state__meta {
  color: var(--text-muted);
  font-family: var(--font-mono);
  font-size: var(--text-xs);
}

.error-state__suggestion {
  max-width: 460px;
  color: var(--text-muted);
  font-size: var(--text-sm);
}

.error-state__retry {
  margin-top: var(--space-3);
}
</style>
