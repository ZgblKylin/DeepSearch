<script setup lang="ts">
/**
 * AI 侧边栏（PLAN 3.5）：
 *
 * - 桌面端由结果页布局提供 sticky 容器，本组件是卡片本体；移动端可折叠；
 * - 状态机来自 useAi 单例：idle → summarizing → ready → followup-loading →
 *   followup-ready / error；
 * - 关闭 AI 模式（settings.aiMode = false）时直接隐藏，请求中止由 T5 调用 abort；
 * - 同一次搜索再次开启时 T5 重新调用 summarize，useAi 内部复用已有摘要。
 */
import { computed, ref } from 'vue'

import { useAi } from '@/composables/useAi'
import { useSettings } from '@/stores/settings'
import AiChat from './AiChat.vue'
import AiSummary from './AiSummary.vue'
import Icon from '@/components/ui/Icon.vue'
import LoadingDots from '@/components/ui/LoadingDots.vue'

const { settings } = useSettings()
const {
  phase,
  mode,
  summary,
  messages,
  sources,
  error,
  notice,
  fetchProgress,
  fetching,
  asking,
  excellentCount,
  authorityCount,
  startFollowup,
  ask,
  retry,
} = useAi()

/** 移动端折叠状态（折叠按钮只在窄屏显示） */
const collapsed = ref(false)

const visible = computed(() => settings.aiMode && phase.value !== 'idle')
const isFollowup = computed(() => mode.value === 'followup')
</script>

<template>
  <aside v-if="visible" class="ai-sidebar" aria-label="AI 摘要">
    <div class="ai-sidebar__card">
      <header class="ai-sidebar__header">
        <div class="ai-sidebar__brand">
          <Icon name="sparkles" :size="16" />
          <span class="ai-sidebar__title">{{ isFollowup ? 'AI 追问' : 'AI 摘要' }}</span>
        </div>
        <button
          type="button"
          class="icon-btn ai-sidebar__toggle"
          :aria-expanded="!collapsed"
          :aria-label="collapsed ? '展开 AI 面板' : '收起 AI 面板'"
          @click="collapsed = !collapsed"
        >
          <Icon :name="collapsed ? 'chevron-down' : 'chevron-up'" :size="16" />
        </button>
      </header>

      <div v-show="!collapsed" class="ai-sidebar__body">
        <div
          v-if="phase === 'summarizing'"
          class="ai-sidebar__loading"
          role="status"
          aria-live="polite"
        >
          <div class="ai-sidebar__loading-row">
            <LoadingDots label="正在生成 AI 摘要" />
            <span>正在生成 AI 摘要</span>
          </div>
          <div class="ai-sidebar__skeleton" aria-hidden="true">
            <span class="ai-sidebar__skeleton-line"></span>
            <span class="ai-sidebar__skeleton-line"></span>
            <span class="ai-sidebar__skeleton-line ai-sidebar__skeleton-line--short"></span>
          </div>
        </div>

        <div
          v-else-if="phase === 'error' && mode === 'summary'"
          class="ai-sidebar__error"
          role="alert"
        >
          <Icon name="alert-circle" :size="18" />
          <div class="ai-sidebar__error-body">
            <p class="ai-sidebar__error-title">AI 摘要生成失败</p>
            <p class="ai-sidebar__error-text">{{ error }}</p>
            <button type="button" class="btn btn--outline btn--sm" @click="retry">
              <Icon name="refresh-cw" :size="13" />
              <span>重试</span>
            </button>
          </div>
        </div>

        <AiSummary
          v-else-if="phase === 'ready' && mode === 'summary'"
          :content="summary"
          :sources="sources"
          :excellent-count="excellentCount"
          :authority-count="authorityCount"
          @followup="startFollowup"
        />

        <AiChat
          v-else-if="mode === 'followup'"
          :phase="phase"
          :messages="messages"
          :sources="sources"
          :fetching="fetching"
          :fetch-completed="fetchProgress.completed"
          :fetch-total="fetchProgress.total"
          :notice="notice"
          :asking="asking"
          :error="error"
          @ask="ask"
          @restart="startFollowup"
          @retry="retry"
        />

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
  align-items: center;
  gap: var(--space-2);
  color: var(--brand);
  min-width: 0;
}

.ai-sidebar__title {
  color: var(--text);
  font-size: var(--text-sm);
  font-weight: 700;
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
