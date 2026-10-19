<script setup lang="ts">
import { computed } from 'vue'

import Icon from '@/components/ui/Icon.vue'
import LoadingDots from '@/components/ui/LoadingDots.vue'
import { useSearch } from '@/composables/useSearch'
import { formatElapsed, formatNumber } from '@/lib/format'
import { useSettings } from '@/stores/settings'
import type { SortMode } from '@/types'
import { SORT_MODES } from '@/types'

/**
 * 结果顶部信息条（PLAN 3.3）：条数、耗时与当前排序。
 * 排序按钮只改 settings.sortMode，列表由 ResultsList 立即重排，不重新请求。
 */
const { results, loading, error, elapsedMs, searched, awaitingKey } = useSearch()
const { settings, update } = useSettings()

const sortLabels: Record<SortMode, string> = {
  relevance: '相关度',
  latest: '最新',
}

const countText = computed(() => `找到 ${formatNumber(results.value.length)} 条结果`)
const elapsedText = computed(() =>
  elapsedMs.value > 0 ? `耗时 ${formatElapsed(elapsedMs.value)}` : '',
)

function setSort(mode: SortMode): void {
  if (settings.sortMode === mode) return
  update({ sortMode: mode })
}
</script>

<template>
  <div class="results-header">
    <div class="results-header__status" aria-live="polite">
      <template v-if="loading">
        <LoadingDots label="正在搜索" size="sm" />
        <span>正在搜索 ···</span>
      </template>
      <template v-else-if="awaitingKey">
        <Icon class="results-header__key-icon" name="key" :size="15" />
        <span class="results-header__key">需要配置 API Key</span>
      </template>
      <template v-else-if="error">
        <Icon class="results-header__error-icon" name="alert-circle" :size="15" />
        <span class="results-header__error">搜索失败</span>
      </template>
      <template v-else-if="searched">
        <span>{{ countText }}</span>
        <template v-if="elapsedText">
          <span class="results-header__dot" aria-hidden="true">·</span>
          <span>{{ elapsedText }}</span>
        </template>
      </template>
      <span v-else class="results-header__muted">等待搜索…</span>
    </div>

    <div class="results-header__sort" role="group" aria-label="结果排序">
      <span class="results-header__sort-label">
        <Icon name="sliders" :size="14" />
        排序
      </span>
      <button
        v-for="mode in SORT_MODES"
        :key="mode"
        type="button"
        class="results-header__sort-btn"
        :class="{ 'results-header__sort-btn--active': settings.sortMode === mode }"
        :aria-pressed="settings.sortMode === mode"
        @click="setSort(mode)"
      >
        {{ sortLabels[mode] }}
      </button>
    </div>
  </div>
</template>

<style scoped>
.results-header {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-2) var(--space-4);
  padding-bottom: var(--space-3);
}

.results-header__status {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  min-width: 0;
  color: var(--text-secondary);
  font-size: var(--text-sm);
}

.results-header__dot {
  color: var(--text-muted);
}

.results-header__error,
.results-header__error-icon {
  color: var(--danger);
}

.results-header__key,
.results-header__key-icon {
  color: var(--brand);
}

.results-header__muted {
  color: var(--text-muted);
}

.results-header__sort {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  padding: 3px;
  border: 1px solid var(--border);
  border-radius: var(--radius-pill);
  background: var(--surface);
}

.results-header__sort-label {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 0 8px 0 6px;
  color: var(--text-muted);
  font-size: var(--text-xs);
}

.results-header__sort-btn {
  padding: 4px 12px;
  border-radius: var(--radius-pill);
  color: var(--text-secondary);
  font-size: var(--text-xs);
  font-weight: 600;
  transition:
    background-color var(--transition-fast),
    color var(--transition-fast);
}

.results-header__sort-btn:hover {
  background: var(--surface-hover);
  color: var(--text);
}

.results-header__sort-btn--active {
  background: var(--brand-soft);
  color: var(--brand);
}

@media (max-width: 480px) {
  .results-header__sort-label {
    display: none;
  }
}
</style>
