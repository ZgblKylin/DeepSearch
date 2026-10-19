<script setup lang="ts">
/**
 * AI 初始摘要卡片：Markdown 正文 + 底部标签行。
 *
 * 底部一行由 AiTags 严格实现（左侧标签、右侧“AI 追问”）；进入追问模式后
 * 本组件整体隐藏，不再显示原摘要标签行。
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
    /** 追问按钮禁用状态 */
    disabled?: boolean
  }>(),
  { sources: () => [], disabled: false },
)

const emit = defineEmits<{
  followup: []
}>()
</script>

<template>
  <section class="ai-summary" aria-label="AI 摘要">
    <MarkdownView :content="content" :sources="sources" />
    <AiTags
      :excellent-count="excellentCount"
      :authority-count="authorityCount"
      :disabled="disabled"
      @followup="emit('followup')"
    />
  </section>
</template>

<style scoped>
.ai-summary {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}
</style>
