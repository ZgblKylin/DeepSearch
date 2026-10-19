<script setup lang="ts">
/**
 * AI 对话侧边栏。
 *
 * - 标题固定为“AI 对话”；
 * - 搜索结果摘要作为对话线程的第一条助手消息；
 * - 输入框在摘要生成后直接可用，用户无需再点单独的追问按钮；
 * - 结果卡片上的“AI 追问”会重置本会话并生成基于该网页的第一条消息。
 */
import { computed, ref } from 'vue'

import { useAi } from '@/composables/useAi'
import { useSettings } from '@/stores/settings'
import AiChat from './AiChat.vue'
import Icon from '@/components/ui/Icon.vue'
import LoadingDots from '@/components/ui/LoadingDots.vue'

const { settings } = useSettings()
const {
  phase,
  mode,
  messages,
  sources,
  error,
  notice,
  fetching,
  asking,
  fetchProgress,
  excellentCount,
  authorityCount,
  ask,
  retry,
} = useAi()

/** 移动端折叠状态（折叠按钮只在窄屏显示） */
const collapsed = ref(false)

const visible = computed(() => settings.aiMode && phase.value !== 'idle')

const loadingLabel = computed(() => {
  if (phase.value === 'summarizing') return '正在生成 AI 摘要'
  if (fetching.value && fetchProgress.total > 0) {
    const current = Math.min(fetchProgress.completed + 1, fetchProgress.total)
    return `正在读取网页 ${current}/${fetchProgress.total}`
  }
  return '正在生成网页摘要'
})
</script>

<template>
  <aside v-if="visible" class="ai-sidebar" aria-label="AI 对话">
    <div class="ai-sidebar__card">
      <header class="ai-sidebar__header">
        <div class="ai-sidebar__brand">
          <Icon name="sparkles" :size="16" />
          <span class="ai-sidebar__title">AI 对话</span>
          <span v-if="sources.length > 0" class="ai-sidebar__source-count">
            基于 {{ sources.length }} 个来源
          </span>
        </div>
        <button
          type="button"
          class="icon-btn ai-sidebar__toggle"
          :aria-expanded="!collapsed"
          :aria-label="collapsed ? '展开 AI 对话' : '收起 AI 对话'"
          @click="collapsed = !collapsed"
        >
          <Icon :name="collapsed ? 'chevron-down' : 'chevron-up'" :size="16" />
        </button>
      </header>

      <div v-show="!collapsed" class="ai-sidebar__body">
        <div
          v-if="phase === 'summarizing' || phase === 'followup-loading'"
          class="ai-sidebar__loading"
          role="status"
          aria-live="polite"
        >
          <div class="ai-sidebar__loading-row">
            <LoadingDots :label="loadingLabel" />
            <span>{{ loadingLabel }}</span>
          </div>
          <div class="ai-sidebar__skeleton" aria-hidden="true">
            <span class="ai-sidebar__skeleton-line"></span>
            <span class="ai-sidebar__skeleton-line"></span>
            <span class="ai-sidebar__skeleton-line ai-sidebar__skeleton-line--short"></span>
          </div>
        </div>

        <div
          v-else-if="phase === 'error' && messages.length === 0"
          class="ai-sidebar__error"
          role="alert"
        >
          <Icon name="alert-circle" :size="18" />
          <div class="ai-sidebar__error-body">
            <p class="ai-sidebar__error-title">AI 对话生成失败</p>
            <p class="ai-sidebar__error-text">{{ error }}</p>
            <button type="button" class="btn btn--outline btn--sm" @click="retry">
              <Icon name="refresh-cw" :size="13" />
              <span>重试</span>
            </button>
          </div>
        </div>

        <AiChat
          v-else-if="messages.length > 0"
          :phase="phase"
          :messages="messages"
          :sources="sources"
          :notice="notice"
          :asking="asking"
          :error="error"
          :show-summary-tags="mode === 'summary'"
          :excellent-count="excellentCount"
          :authority-count="authorityCount"
          @ask="ask"
          @retry="retry"
        />

        <div v-else class="ai-sidebar__loading" role="status">
          <div class="ai-sidebar__loading-row">
            <LoadingDots label="正在准备 AI 对话" />
            <span>正在准备 AI 对话</span>
          </div>
        </div>

        <p class="ai-sidebar__disclaimer">AI 生成，仅供参考</p>
      </div>
    </div>
  </aside>
</template>

<style scoped>
.ai-sidebar {
  min-width: 0;
}

.ai-sidebar__card {
  display: flex;
  flex-direction: column;
  max-height: calc(100vh - var(--topbar-height) - var(--space-8));
  overflow: hidden;
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  background: var(--bg-elevated);
  box-shadow: var(--shadow-sm);
}

.ai-sidebar__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-2);
  padding: var(--space-3) var(--space-4);
  border-bottom: 1px solid var(--border);
}

.ai-sidebar__brand {
  display: inline-flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: var(--space-1) var(--space-2);
  color: var(--brand);
  min-width: 0;
}

.ai-sidebar__title {
  color: var(--text);
  font-size: var(--text-sm);
  font-weight: 700;
  white-space: nowrap;
}

.ai-sidebar__source-count {
  color: var(--text-muted);
  font-size: var(--text-xs);
  font-weight: 400;
  white-space: nowrap;
}

/* 折叠按钮只在移动端/窄屏显示 */
.ai-sidebar__toggle {
  display: none;
  flex: 0 0 auto;
  width: 30px;
  height: 30px;
}

.ai-sidebar__body {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  padding: var(--space-4);
  overflow-y: auto;
  overscroll-behavior: contain;
}

.ai-sidebar__loading {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

.ai-sidebar__loading-row {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  color: var(--text-secondary);
  font-size: var(--text-sm);
}

.ai-sidebar__skeleton {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.ai-sidebar__skeleton-line {
  height: 10px;
  border-radius: var(--radius-pill);
  background: var(--bg-inset);
  animation: ai-skeleton-pulse 1.4s ease-in-out infinite;
}

.ai-sidebar__skeleton-line--short {
  width: 62%;
}

.ai-sidebar__error {
  display: flex;
  align-items: flex-start;
  gap: var(--space-2);
  padding: var(--space-3);
  border-radius: var(--radius-md);
  background: var(--danger-soft);
  color: var(--danger);
}

.ai-sidebar__error-body {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  min-width: 0;
}

.ai-sidebar__error-title {
  font-size: var(--text-sm);
  font-weight: 700;
}

.ai-sidebar__error-text {
  color: var(--text-secondary);
  font-size: var(--text-xs);
  overflow-wrap: anywhere;
}

.ai-sidebar__disclaimer {
  margin-top: auto;
  padding-top: var(--space-2);
  border-top: 1px dashed var(--border);
  color: var(--text-muted);
  font-size: var(--text-xs);
  text-align: center;
}

@keyframes ai-skeleton-pulse {
  0%,
  100% {
    opacity: 0.55;
  }

  50% {
    opacity: 1;
  }
}

@media (max-width: 1024px) {
  .ai-sidebar__card {
    max-height: none;
  }

  .ai-sidebar__toggle {
    display: inline-flex;
  }
}
</style>
