<script setup lang="ts">
import { computed } from 'vue'

import BaseModal from '@/components/ui/BaseModal.vue'
import Icon from '@/components/ui/Icon.vue'
import { formatErrorDetails, statusSuggestion } from '@/lib/errors'
import { useUi } from '@/stores/ui'

/**
 * 全局错误弹窗（PLAN 3.7）：
 * - 展示 HTTP 状态码（网络错误为“—”）、错误码、message、可选请求 ID；
 * - 401/402/429/5xx 给出对应建议；
 * - 关闭 / 复制详情；点击外部或 Esc 由 BaseModal 处理；
 * - 同一时刻只显示一个错误，新错误覆盖旧错误（状态在 useUi 单例中）。
 */
const { ui, closeErrorModal, showToast } = useUi()

const error = computed(() => ui.errorModal.error)
const statusText = computed(() =>
  error.value && error.value.status !== null ? String(error.value.status) : '—',
)
const suggestion = computed(() =>
  error.value ? statusSuggestion(error.value.status) : '',
)
const details = computed(() => formatErrorDetails(error.value))

async function copyDetails(): Promise<void> {
  if (!details.value) return
  const clipboard = typeof navigator !== 'undefined' ? navigator.clipboard : undefined
  if (!clipboard || typeof clipboard.writeText !== 'function') {
    showToast('当前浏览器不支持自动复制，请手动复制', 'error')
    return
  }
  try {
    await clipboard.writeText(details.value)
    showToast('错误详情已复制', 'success')
  } catch {
    showToast('复制失败，请手动复制', 'error')
  }
}
</script>

<template>
  <BaseModal
    :open="ui.errorModal.open"
    :title="ui.errorModal.title || '请求失败'"
    size="md"
    @close="closeErrorModal"
  >
    <div v-if="error" class="error-modal">
      <dl class="error-modal__fields">
        <div class="error-modal__field">
          <dt class="error-modal__label">HTTP 状态码</dt>
          <dd class="error-modal__value">
            <span
              class="error-modal__status"
              :class="{ 'error-modal__status--network': error.status === null }"
            >
              {{ statusText }}
            </span>
          </dd>
        </div>
        <div class="error-modal__field">
          <dt class="error-modal__label">错误码</dt>
          <dd class="error-modal__value"><code>{{ error.code || '—' }}</code></dd>
        </div>
        <div class="error-modal__field error-modal__field--message">
          <dt class="error-modal__label">错误消息</dt>
          <dd class="error-modal__value error-modal__message">{{ error.message || '—' }}</dd>
        </div>
        <div v-if="error.requestId" class="error-modal__field">
          <dt class="error-modal__label">请求 ID</dt>
          <dd class="error-modal__value"><code>{{ error.requestId }}</code></dd>
        </div>
        <div v-if="error.type" class="error-modal__field">
          <dt class="error-modal__label">错误类型</dt>
          <dd class="error-modal__value"><code>{{ error.type }}</code></dd>
        </div>
      </dl>

      <div v-if="suggestion" class="error-modal__suggestion" role="note">
        <Icon name="info" :size="16" class="error-modal__suggestion-icon" />
        <span>{{ suggestion }}</span>
      </div>
    </div>
    <p v-else class="error-modal__empty">没有可展示的错误信息。</p>

    <template #footer>
      <button
        type="button"
        class="btn btn--outline"
        :disabled="!details"
        @click="copyDetails"
      >
        <Icon name="copy" :size="14" />
        复制详情
      </button>
      <button type="button" class="btn btn--primary" @click="closeErrorModal">关闭</button>
    </template>
  </BaseModal>
</template>

<style scoped>
.error-modal {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

.error-modal__fields {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  margin: 0;
}

.error-modal__field {
  display: grid;
  grid-template-columns: 96px minmax(0, 1fr);
  gap: var(--space-2);
  align-items: baseline;
}

.error-modal__field--message {
  align-items: start;
}

.error-modal__label {
  color: var(--text-muted);
  font-size: var(--text-sm);
}

.error-modal__value {
  margin: 0;
  overflow-wrap: anywhere;
  font-size: var(--text-sm);
}

.error-modal__value code {
  padding: 1px 6px;
  border-radius: var(--radius-xs);
  background: var(--bg-inset);
  font-family: var(--font-mono);
  font-size: var(--text-xs);
}

.error-modal__status {
  display: inline-flex;
  align-items: center;
  padding: 1px 8px;
  border-radius: var(--radius-pill);
  background: var(--danger-soft);
  color: var(--danger);
  font-family: var(--font-mono);
  font-size: var(--text-xs);
  font-weight: 700;
}

.error-modal__status--network {
  background: var(--bg-inset);
  color: var(--text-secondary);
}

.error-modal__message {
  color: var(--text);
  line-height: 1.7;
  white-space: pre-wrap;
}

.error-modal__suggestion {
  display: flex;
  align-items: flex-start;
  gap: var(--space-2);
  padding: var(--space-3);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  background: var(--bg-subtle);
  color: var(--text-secondary);
  font-size: var(--text-sm);
  line-height: 1.7;
}

.error-modal__suggestion-icon {
  flex: none;
  margin-top: 3px;
  color: var(--brand);
}

.error-modal__empty {
  color: var(--text-muted);
  font-size: var(--text-sm);
}
</style>
