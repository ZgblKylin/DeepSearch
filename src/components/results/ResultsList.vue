<script setup lang="ts">
import { computed } from 'vue'

import EmptyState from '@/components/results/EmptyState.vue'
import ErrorState from '@/components/results/ErrorState.vue'
import KeyRequiredState from '@/components/results/KeyRequiredState.vue'
import ResultCard from '@/components/results/ResultCard.vue'
import ResultsSkeleton from '@/components/results/ResultsSkeleton.vue'
import { useQueryRoute } from '@/composables/useQueryRoute'
import { useSearch } from '@/composables/useSearch'
import { clearQueryFilters, hasActiveFilters, parseQuery } from '@/lib/query'
import { sortResults } from '@/lib/sort'
import { useSettings } from '@/stores/settings'
import { useUi } from '@/stores/ui'

/**
 * 结果列表（PLAN 3.3）：
 * - 加载中：骨架 + “正在搜索 ···”，旧结果已由 useSearch 清空；
 * - 等待 Key：显示可操作的“需要配置 API Key”状态，不落加载骨架（QA P2-1）；
 * - 失败：页内错误状态 + 重试（全局错误弹窗由 useSearch 触发）；
 * - 空结果：空状态，可一键清除筛选；
 * - 有结果：按 settings.sortMode 立即排序（不重新请求）。
 */
const { results, loading, error, searched, awaitingKey, query: searchedQuery, run, retry } =
  useSearch()
const { settings } = useSettings()
const { query, navigate } = useQueryRoute()
const { openApiKeyModal } = useUi()

const sortedResults = computed(() => sortResults(results.value, settings.sortMode))
const filters = computed(() => parseQuery(query.value).filters)
const hasFilters = computed(() => hasActiveFilters(filters.value))

/** 打开 Key 弹窗；保存后自动重试当前查询（关闭弹窗后仍可再次进入） */
function configureKey(): void {
  openApiKeyModal(() => {
    void retry()
  })
}

function clearFilters(): void {
  const next = clearQueryFilters(query.value)
  if (!next) {
    navigate('')
    void run('')
    return
  }
  navigate(next)
  void run(next)
}
</script>

<template>
  <section class="results-list" :aria-busy="loading || undefined">
    <h2 class="visually-hidden">搜索结果</h2>

    <ResultsSkeleton v-if="loading" />

    <KeyRequiredState
      v-else-if="awaitingKey"
      @configure="configureKey"
      @retry="retry"
    />

    <ErrorState v-else-if="error" :error="error" @retry="retry" />

    <template v-else-if="sortedResults.length > 0">
      <ol class="results-list__items">
        <li v-for="(result, index) in sortedResults" :key="`${result.url}-${index}`">
          <ResultCard :result="result" />
        </li>
      </ol>
    </template>

    <EmptyState
      v-else-if="searched"
      :query="searchedQuery"
      :has-filters="hasFilters"
      @clear-filters="clearFilters"
    />

    <!-- 尚未得到第一份结果（等待集成层触发 run）：保持骨架，避免空状态闪烁 -->
    <ResultsSkeleton v-else />
  </section>
</template>

<style scoped>
.results-list {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

.results-list__items {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

.results-list__items > li {
  min-width: 0;
}
</style>
