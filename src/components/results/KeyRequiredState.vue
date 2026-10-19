<script setup lang="ts">
import Icon from '@/components/ui/Icon.vue'

/**
 * “需要配置 API Key”状态（QA P2-1 修复）。
 *
 * 搜索被 `ui.requireApiKey` 拦截、或用户关闭 Key 弹窗未保存时显示，
 * 替代此前的“永久正在搜索 ···”骨架；提供打开 Key 弹窗与重试入口。
 */
defineEmits<{
  /** 打开 Key 配置弹窗（保存后自动重试当前查询） */
  configure: []
  /** 直接重试当前查询（Key 已配置时立即重新搜索） */
  retry: []
}>()
</script>

<template>
  <div class="key-required">
    <span class="key-required__icon" aria-hidden="true">
      <Icon name="key" :size="26" />
    </span>
    <h2 class="key-required__title">需要配置 API Key</h2>
    <p class="key-required__message">
      搜索由 DeepSeek API 提供，需要先在浏览器本地保存 API Key 才能发起请求；Key 不会上传到本站服务器。
    </p>
    <div class="key-required__actions">
      <button type="button" class="btn btn--primary btn--sm" @click="$emit('configure')">
        <Icon name="key" :size="15" />
        配置 API Key
      </button>
      <button type="button" class="btn btn--outline btn--sm" @click="$emit('retry')">
        <Icon name="refresh-cw" :size="15" />
        重试
      </button>
    </div>
    <p class="key-required__hint">关闭弹窗后，仍可点击上方按钮或再次提交搜索重新配置并重试。</p>
  </div>
</template>

<style scoped>
.key-required {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-16) var(--space-4);
  text-align: center;
}

.key-required__icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 56px;
  height: 56px;
  margin-bottom: var(--space-2);
  border-radius: 50%;
  background: var(--brand-soft);
  color: var(--brand);
}

.key-required__title {
  font-size: var(--text-lg);
  font-weight: 700;
}

.key-required__message {
  max-width: 560px;
  color: var(--text-secondary);
  font-size: var(--text-sm);
  overflow-wrap: anywhere;
}

.key-required__actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: var(--space-2);
  margin-top: var(--space-3);
}

.key-required__hint {
  color: var(--text-muted);
  font-size: var(--text-xs);
}
</style>
