<script setup lang="ts">
/**
 * Markdown 渲染视图：marked + DOMPurify（见 lib/markdown.ts）。
 *
 * 只负责把已清洗的 HTML 交给 v-html，并提供面板内的排版样式。
 */
import { computed } from 'vue'

import type { AiSource } from '@/types'
import { renderMarkdown } from '@/lib/markdown'

const props = withDefaults(
  defineProps<{
    /** 模型输出的 Markdown 文本 */
    content: string
    /** 会话来源，用于把正文里的 [n] 转成来源链接 */
    sources?: readonly AiSource[]
  }>(),
  { sources: () => [] },
)

const html = computed(() => renderMarkdown(props.content, props.sources))
</script>

<template>
  <div class="markdown-view" v-html="html"></div>
</template>

<style scoped>
.markdown-view {
  color: var(--text);
  font-size: var(--text-sm);
  line-height: 1.7;
  overflow-wrap: anywhere;
}

.markdown-view :deep(> :first-child) {
  margin-top: 0;
}

.markdown-view :deep(> :last-child) {
  margin-bottom: 0;
}

.markdown-view :deep(p) {
  margin: 0 0 var(--space-3);
}

.markdown-view :deep(h1),
.markdown-view :deep(h2),
.markdown-view :deep(h3),
.markdown-view :deep(h4) {
  margin: var(--space-4) 0 var(--space-2);
  color: var(--text);
  font-size: var(--text-base);
  font-weight: 700;
  line-height: 1.4;
}

.markdown-view :deep(h1) {
  font-size: var(--text-lg);
}

.markdown-view :deep(h2) {
  font-size: var(--text-base);
}

.markdown-view :deep(ul),
.markdown-view :deep(ol) {
  margin: 0 0 var(--space-3);
  padding-left: var(--space-5);
}

.markdown-view :deep(ul) {
  list-style: disc;
}

.markdown-view :deep(ol) {
  list-style: decimal;
}

.markdown-view :deep(li) {
  margin: 2px 0;
}

.markdown-view :deep(li > p) {
  margin: 0;
}

.markdown-view :deep(a) {
  color: var(--brand);
  text-decoration: underline;
  text-underline-offset: 2px;
}

.markdown-view :deep(strong) {
  font-weight: 700;
}

.markdown-view :deep(code) {
  padding: 1px 5px;
  border-radius: var(--radius-xs);
  background: var(--bg-inset);
  font-family: var(--font-mono);
  font-size: 0.92em;
}

.markdown-view :deep(pre) {
  margin: 0 0 var(--space-3);
  padding: var(--space-3);
  overflow-x: auto;
  border-radius: var(--radius-sm);
  background: var(--bg-inset);
}

.markdown-view :deep(pre code) {
  padding: 0;
  background: none;
}

.markdown-view :deep(blockquote) {
  margin: 0 0 var(--space-3);
  padding-left: var(--space-3);
  border-left: 3px solid var(--border-strong);
  color: var(--text-secondary);
}

.markdown-view :deep(hr) {
  margin: var(--space-4) 0;
  border: none;
  border-top: 1px solid var(--border);
}

.markdown-view :deep(table) {
  width: 100%;
  margin: 0 0 var(--space-3);
  border-collapse: collapse;
  font-size: var(--text-xs);
}

.markdown-view :deep(th),
.markdown-view :deep(td) {
  padding: var(--space-1) var(--space-2);
  border: 1px solid var(--border);
  text-align: left;
}

.markdown-view :deep(th) {
  background: var(--bg-subtle);
  font-weight: 600;
}

.markdown-view :deep(sup.md-cite) {
  margin-left: 1px;
  font-size: 0.68em;
  line-height: 0;
  vertical-align: super;
}

.markdown-view :deep(sup.md-cite a) {
  color: var(--brand);
  font-weight: 600;
  text-decoration: none;
}

.markdown-view :deep(sup.md-cite a:hover) {
  text-decoration: underline;
}
</style>
