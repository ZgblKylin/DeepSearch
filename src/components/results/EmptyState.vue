<script setup lang="ts">
import Icon from '@/components/ui/Icon.vue'

/**
 * 空结果状态（PLAN 3.3）。
 * 有筛选条件时提供“清除筛选”，退回纯文本查询。
 */
withDefaults(
  defineProps<{
    /** 当前查询串（用于回显）；空串时不显示 */
    query?: string
    /** 当前是否带筛选项 */
    hasFilters?: boolean
  }>(),
  { query: '', hasFilters: false },
)

defineEmits<{ 'clear-filters': [] }>()
</script>

<template>
  <div class="empty-state">
    <span class="empty-state__icon" aria-hidden="true">
      <Icon name="search" :size="26" />
    </span>
    <h2 class="empty-state__title">没有找到相关结果</h2>
    <p v-if="query" class="empty-state__query">没有与「{{ query }}」匹配的内容。</p>
    <p class="empty-state__hint">试试更换关键词、移除部分筛选条件，或检查搜索语法是否正确。</p>
    <button
      v-if="hasFilters"
      type="button"
      class="btn btn--outline btn--sm empty-state__action"
      @click="$emit('clear-filters')"
    >
      清除筛选
    </button>
  </div>
</template>

<style scoped>
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-16) var(--space-4);
  text-align: center;
}

.empty-state__icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 56px;
  height: 56px;
  margin-bottom: var(--space-2);
  border-radius: 50%;
  background: var(--bg-inset);
  color: var(--text-muted);
}

.empty-state__title {
  font-size: var(--text-lg);
  font-weight: 700;
}

.empty-state__query {
  max-width: 560px;
  color: var(--text-secondary);
  font-size: var(--text-sm);
  overflow-wrap: anywhere;
}

.empty-state__hint {
  max-width: 460px;
  color: var(--text-muted);
  font-size: var(--text-sm);
}

.empty-state__action {
  margin-top: var(--space-3);
}
</style>
