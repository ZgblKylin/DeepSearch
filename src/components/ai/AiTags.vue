<script setup lang="ts">
/**
 * 摘要底部标签行（PLAN 3.5）：
 *
 * 严格一行：左侧“优质 N”（rerank_score >= 1.5）与“权威 N”（authority >= 3），
 * 右侧“AI 追问”按钮。点击后由父组件重置会话并进入追问模式。
 */
import Icon from '@/components/ui/Icon.vue'

withDefaults(
  defineProps<{
    /** rerank_score >= 1.5 的结果数 */
    excellentCount: number
    /** authority >= 3 的结果数 */
    authorityCount: number
    /** 追问按钮是否禁用（例如请求进行中） */
    disabled?: boolean
  }>(),
  { disabled: false },
)

const emit = defineEmits<{
  followup: []
}>()
</script>

<template>
  <div class="ai-tags">
    <div class="ai-tags__badges">
      <span class="ai-tags__badge ai-tags__badge--excellent" title="相关度较高的结果数量">
        <Icon name="star" :size="13" />
        <span>优质 {{ excellentCount }}</span>
      </span>
      <span class="ai-tags__badge ai-tags__badge--authority" title="权威度较高的结果数量">
        <Icon name="shield" :size="13" />
        <span>权威 {{ authorityCount }}</span>
      </span>
    </div>

    <button
      type="button"
      class="btn btn--primary btn--sm ai-tags__followup"
      :disabled="disabled"
      @click="emit('followup')"
    >
      <Icon name="message-circle" :size="14" />
      <span>AI 追问</span>
    </button>
  </div>
</template>

<style scoped>
.ai-tags {
  display: flex;
  flex-wrap: nowrap;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
  padding-top: var(--space-3);
  border-top: 1px solid var(--border);
}

.ai-tags__badges {
  display: flex;
  flex-wrap: nowrap;
  align-items: center;
  gap: var(--space-2);
  min-width: 0;
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

.ai-tags__followup {
  flex: 0 0 auto;
}
</style>
