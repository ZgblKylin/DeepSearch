<script setup lang="ts">
import AiSidebar from '@/components/ai/AiSidebar.vue'
import FilterBar from '@/components/results/FilterBar.vue'
import ResultsHeader from '@/components/results/ResultsHeader.vue'
import ResultsList from '@/components/results/ResultsList.vue'
import { useSettings } from '@/stores/settings'

/**
 * 结果页布局（PLAN 3.3）：
 * 顶部紧凑搜索框由 TopBar 居中提供（结果页唯一一个 `site-search` 过渡目标），
 * 本视图负责结果列 + 右侧 sticky AI 侧边栏；窗口变窄时单列。
 *
 * AI 模式关闭时不保留 380px 空侧栏，结果列单列占满（QA P2-4 后续补丁 T7b）。
 */
const { settings } = useSettings()
</script>

<template>
  <section class="results-view">
    <div class="results-layout container" :class="{ 'results-layout--no-ai': !settings.aiMode }">
      <div class="results-layout__main">
        <ResultsHeader />
        <FilterBar />
        <ResultsList />
      </div>
      <div v-if="settings.aiMode" class="results-layout__aside">
        <AiSidebar />
      </div>
    </div>
  </section>
</template>

<style scoped>
.results-view {
  padding-top: var(--space-6);
}

.results-layout {
  display: grid;
  grid-template-columns: minmax(0, 1fr) var(--sidebar-width);
  align-items: start;
  gap: var(--space-8);
}

/* AI 模式关闭：不保留空的 380px 侧栏列，结果列占满 */
.results-layout--no-ai {
  grid-template-columns: minmax(0, 1fr);
}

.results-layout__main {
  min-width: 0;
}

.results-layout__aside {
  position: sticky;
  top: calc(var(--topbar-height) + var(--space-4));
  min-width: 0;
}

@media (max-width: 1024px) {
  .results-layout,
  .results-layout--no-ai {
    grid-template-columns: minmax(0, 1fr);
  }

  .results-layout__aside {
    position: static;
  }
}

@media (max-width: 768px) {
  .results-view {
    padding-top: var(--space-4);
  }
}
</style>
