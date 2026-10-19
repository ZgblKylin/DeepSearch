<script setup lang="ts">
/**
 * AI 对话的第一条助手消息：搜索结果摘要 Markdown + 底部优质/权威标签。
 *
 * 后续追问直接在同一个对话线程中进行，不再由这里触发二次总结。
 */
import type { AiSource } from '@/types'
import AiTags from './AiTags.vue'
import MarkdownView from './MarkdownView.vue'

withDefaults(
  defineProps<{
    /** 初始摘要 Markdown */
    content: string
    /** 摘要引用的来源 */
    sources?: readonly AiSource[]
    excellentCount: number
    authorityCount: number
  }>(),
  { sources: () => [] },
)
</script>

<template>
  <section class="ai-summary" aria-label="AI 摘要">
    <MarkdownView :content="content" :sources="sources" />
    <AiTags :excellent-count="excellentCount" :authority-count="authorityCount" />
  </section>
</template>

<style scoped>
.ai-summary {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}
</style>
