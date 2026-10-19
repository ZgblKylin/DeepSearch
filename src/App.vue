<script setup lang="ts">
import { onBeforeUnmount, onMounted, watch } from 'vue'

import FooterDisclaimer from '@/components/layout/FooterDisclaimer.vue'
import TopBar from '@/components/layout/TopBar.vue'
import ApiKeyModal from '@/components/settings/ApiKeyModal.vue'
import ErrorModal from '@/components/settings/ErrorModal.vue'
import SettingsPanel from '@/components/settings/SettingsPanel.vue'
import ToastHost from '@/components/ui/ToastHost.vue'
import { useAi } from '@/composables/useAi'
import { useQueryRoute } from '@/composables/useQueryRoute'
import { useSearch } from '@/composables/useSearch'
import { useTheme } from '@/composables/useTheme'
import { useSettings } from '@/stores/settings'
import { useUi } from '@/stores/ui'
import HomeView from '@/views/HomeView.vue'
import ResultsView from '@/views/ResultsView.vue'

const { query, syncFromLocation } = useQueryRoute()
const { settings, seedDevKey } = useSettings()
const { showToast } = useUi()
const {
  query: searchQuery,
  run: runSearch,
  cancel: cancelSearch,
  loading: searchLoading,
  results: searchResults,
  searched,
} = useSearch()
const ai = useAi()

// 挂载主题单例（首屏主题已由 index.html 内联脚本设置）
useTheme()

// 开发 Key 必须在路由 watcher 建立前注入，避免首次带 ?q= 打开时先弹 Key 弹窗。
const seededDevKey = seedDevKey()

/**
 * 路由 → 搜索（T5 集成点）：
 * - q 非空：新搜索先重置 AI 会话，再交给 useSearch.run（Key 弹窗、长度校验、
 *   请求取消、同 q 去重都在 run 内部处理，这里不重复包装 requireApiKey）；
 * - q 为空：取消在途搜索、恢复搜索初始状态并重置 AI；
 * - immediate 保证直接打开 `?q=` 链接时自动搜索。
 */
watch(
  query,
  (next) => {
    if (next) {
      ai.reset()
      void runSearch(next)
      return
    }
    cancelSearch()
    void runSearch('')
    ai.reset()
  },
  { immediate: true },
)

/**
 * 搜索完成 → 自动 AI 摘要（T5 集成点）：
 * - 仅当“非加载中 + 已搜索 + 有结果 + AI 模式开启”时调用 summarize；
 * - summarize 内部按 query + results 指纹复用已有摘要，重复调用不重复计费；
 * - AI 模式从开启切到关闭时中止在途请求；关闭状态下不发起摘要。
 */
let lastAiEnabled = settings.aiMode
watch(
  [searchLoading, searchResults, () => settings.aiMode],
  ([isLoading, currentResults, aiEnabled]) => {
    if (!aiEnabled) {
      if (lastAiEnabled) ai.abort()
      lastAiEnabled = false
      return
    }
    lastAiEnabled = true
    if (isLoading || !searched.value || currentResults.length === 0) return
    // 缺少 Key 等原因导致 run 未真正执行时，结果可能仍属于上一个 query；
    // 只有当前结果与地址栏 query 一致才允许自动摘要，避免给旧结果生成摘要。
    if (searchQuery.value !== query.value) return
    ai.summarize()
  },
)

onMounted(() => {
  window.addEventListener('popstate', syncFromLocation)
  if (seededDevKey) {
    showToast('已从 .env 注入开发环境 API Key')
  }
})

onBeforeUnmount(() => {
  window.removeEventListener('popstate', syncFromLocation)
})
</script>

<template>
  <div class="app-shell">
    <TopBar />

    <main class="app-main">
      <ResultsView v-if="query" />
      <HomeView v-else />
    </main>

    <FooterDisclaimer />

    <SettingsPanel />
    <ApiKeyModal />
    <ErrorModal />
    <ToastHost />
  </div>
</template>
