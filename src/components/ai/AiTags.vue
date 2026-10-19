<script setup lang="ts">
/**
 * 对话第一条摘要下方的标签行：只展示搜索结果的优质/权威数量。
 *
 * 追问入口已经移到每条搜索结果卡片；这里不再提供单独按钮。
 */
import Icon from '@/components/ui/Icon.vue'

withDefaults(
  defineProps<{
    /** rerank_score >= 1.5 的结果数 */
    excellentCount: number
    /** authority >= 3 的结果数 */
    authorityCount: number
  }>(),
  {},
)
</script>

<template>
  <div class="ai-tags">
    <span class="ai-tags__badge ai-tags__badge--excellent" title="相关度较高的结果数量">
      <Icon name="star" :size="13" />
      <span>优质 {{ excellentCount }}</span>
    </span>
    <span class="ai-tags__badge ai-tags__badge--authority" title="权威度较高的结果数量">
      <Icon name="shield" :size="13" />
      <span>权威 {{ authorityCount }}</span>
    </span>
  </div>
</template>

<style scoped>
.ai-tags {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-2);
  padding-top: var(--space-3);
  border-top: 1px solid var(--border);
}

.ai-tags__badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 8px;
  border-radius: var(--radius-pill);
  font-size: var(--text-xs);
  font-weight: 600;
  line-height: 1.6;
  white-space: nowrap;
}

.ai-tags__badge--excellent {
  background: var(--warning-soft);
  color: var(--warning);
}

.ai-tags__badge--authority {
  background: var(--brand-soft);
  color: var(--brand);
}
</style>
