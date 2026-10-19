<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'

import AiModeToggle from '@/components/search/AiModeToggle.vue'
import EngineButton from '@/components/search/EngineButton.vue'
import HelpPopover from '@/components/search/HelpPopover.vue'
import Icon from '@/components/ui/Icon.vue'
import { useQueryRoute } from '@/composables/useQueryRoute'
import { useSearch } from '@/composables/useSearch'
import { useViewTransition } from '@/composables/useViewTransition'
import { MAX_QUERY_LENGTH, countQueryChars, validateQuery } from '@/lib/query'

/**
 * 搜索框（PLAN 3.2）。
 *
 * 结构：搜索图标 + 输入框 + AI 模式胶囊开关 + 搜索按钮，搜索按钮右侧依次是
 * 外部搜索引擎按钮（只显示 logo）与帮助图标。首页与结果页共用，靠 `compact`
 * 区分尺寸；根节点 `view-transition-name: site-search` 供首页 → 结果页的
 * View Transition 位移。
 *
 * 本组件只负责把合法的 q 写入路由；实际请求由 useSearch（集成层调用 run）发起。
 */
const props = withDefaults(
  defineProps<{
    /** 结果页紧凑样式 */
    compact?: boolean
    /** 自动聚焦（移动端会跳过，避免唤起键盘） */
    autofocus?: boolean
  }>(),
  { compact: false, autofocus: false },
)

const { query, navigate } = useQueryRoute()
const { run: runViewTransition } = useViewTransition()
const { error: searchError, awaitingKey, retry } = useSearch()

const inputRef = ref<HTMLInputElement | null>(null)
const value = ref(query.value)
/** 提交失败时的行内提示（长度超限的提示实时计算） */
const submitHint = ref('')

const validation = computed(() => validateQuery(value.value))
const overLimit = computed(() => countQueryChars(value.value) > MAX_QUERY_LENGTH)
const canSubmit = computed(() => validation.value.valid)
const hintMessage = computed(() => (overLimit.value ? validation.value.message : submitHint.value))
const hintId = 'site-search-hint'

watch(query, (next) => {
  value.value = next
  submitHint.value = ''
})

watch(value, () => {
  if (submitHint.value) submitHint.value = ''
})

function focusInput(): void {
  inputRef.value?.focus()
}

function clearInput(): void {
  value.value = ''
  focusInput()
}

function submit(): void {
  const result = validateQuery(value.value)
  if (!result.valid) {
    submitHint.value = result.message
    return
  }
  const next = value.value.trim()
  submitHint.value = ''
  if (next === query.value) {
    // 同一 q 再次提交：页内错误或等待 API Key 时视为重试（QA P3-5），
    // 失败后可重新发起请求 / 重新打开 Key 弹窗；其余情况保持静默失焦。
    if (searchError.value || awaitingKey.value) {
      void retry()
      return
    }
    inputRef.value?.blur()
    return
  }
  // 首页 → 结果页：搜索框用 View Transitions 从 hero 移动到结果页顶部（PLAN 3.1）；
  // 结果页内的紧凑搜索框直接导航，避免重复动画。
  if (props.compact) {
    navigate(next)
    return
  }
  runViewTransition(() => navigate(next))
}

onMounted(() => {
  if (!props.autofocus) return
  // 移动端不自动聚焦（PLAN 3.8）
  const isNarrow = typeof window.matchMedia === 'function' && window.matchMedia('(max-width: 768px)').matches
  if (!isNarrow) focusInput()
})
</script>

<template>
  <div class="search-bar" :class="{ 'search-bar--compact': props.compact }">
    <form class="search-bar__form" role="search" aria-label="搜索" @submit.prevent="submit">
      <div class="search-bar__field" :class="{ 'search-bar__field--invalid': overLimit }">
        <span class="search-bar__icon" aria-hidden="true">
          <Icon name="search" :size="19" />
        </span>

        <input
          ref="inputRef"
          v-model="value"
          class="search-bar__input"
          type="search"
          name="q"
          placeholder="搜索 DeepSeek 相关内容…"
          aria-label="搜索内容"
          :aria-invalid="overLimit || undefined"
          :aria-describedby="hintMessage ? hintId : undefined"
          autocomplete="off"
          autocapitalize="off"
          spellcheck="false"
          enterkeyhint="search"
        />

        <button
          v-if="value"
          type="button"
          class="search-bar__clear"
          aria-label="清空输入"
          title="清空"
          @click="clearInput"
        >
          <Icon name="close" :size="15" />
        </button>

        <AiModeToggle />

        <button type="submit" class="btn btn--primary search-bar__submit" :disabled="!canSubmit">
          搜索
        </button>
      </div>

      <div class="search-bar__actions">
        <EngineButton :query="value" />
        <HelpPopover />
      </div>
    </form>

    <p v-if="hintMessage" :id="hintId" class="search-bar__hint" role="status">
      {{ hintMessage }}
    </p>
  </div>
</template>

<style scoped>
.search-bar {
  position: relative;
  width: 100%;
  /* 首页 ↔ 结果页搜索框共享的 View Transition 名称（PLAN 3.1） */
  view-transition-name: site-search;
}

.search-bar--compact {
  max-width: var(--hero-max);
  margin-inline: auto;
}

.search-bar__form {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  width: 100%;
}

.search-bar__field {
  display: flex;
  flex: 1 1 auto;
  align-items: center;
  gap: var(--space-2);
  min-width: 0;
  height: 52px;
  padding: 0 6px 0 var(--space-4);
  border: 1px solid var(--border);
  border-radius: var(--radius-pill);
  background: var(--surface);
  box-shadow: var(--shadow-sm);
  transition:
    border-color var(--transition-fast),
    box-shadow var(--transition-fast);
}

.search-bar--compact .search-bar__field {
  height: 46px;
}

.search-bar__field:focus-within {
  border-color: var(--brand);
  box-shadow: 0 0 0 4px var(--brand-soft);
}

.search-bar__field--invalid,
.search-bar__field--invalid:focus-within {
  border-color: var(--danger);
  box-shadow: 0 0 0 4px var(--danger-soft);
}

.search-bar__icon {
  display: inline-flex;
  flex: none;
  color: var(--text-muted);
}

.search-bar__input {
  flex: 1 1 auto;
  min-width: 0;
  height: 100%;
  padding: 0;
  border: none;
  outline: none;
  background: transparent;
  color: var(--text);
  font-size: var(--text-base);
}

.search-bar__input::placeholder {
  color: var(--text-muted);
}

.search-bar__input::-webkit-search-cancel-button,
.search-bar__input::-webkit-search-decoration {
  display: none;
}

.search-bar__clear {
  display: inline-flex;
  flex: none;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  border-radius: 50%;
  color: var(--text-muted);
  transition:
    background-color var(--transition-fast),
    color var(--transition-fast);
}

.search-bar__clear:hover {
  background: var(--surface-hover);
  color: var(--text);
}

.search-bar__submit {
  flex: none;
  height: 40px;
  padding-inline: 20px;
}

.search-bar--compact .search-bar__submit {
  height: 36px;
  padding-inline: 18px;
}

.search-bar__actions {
  display: flex;
  flex: none;
  align-items: center;
  gap: var(--space-1);
}

.search-bar__hint {
  margin-top: var(--space-2);
  padding-inline: var(--space-2);
  color: var(--danger);
  font-size: var(--text-xs);
  line-height: 1.5;
  text-align: left;
}

@media (max-width: 768px) {
  .search-bar__field {
    height: 48px;
    padding-left: var(--space-3);
    gap: var(--space-1);
  }

  .search-bar--compact .search-bar__field {
    height: 44px;
  }

  .search-bar__submit {
    height: 36px;
    padding-inline: 14px;
  }
}

@media (max-width: 480px) {
  .search-bar__form {
    flex-wrap: wrap;
  }

  .search-bar__field {
    flex: 1 1 100%;
    width: 100%;
  }

  .search-bar__actions {
    margin-left: auto;
  }
}
</style>
