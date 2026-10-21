<script setup lang="ts">
import { ref, watch } from 'vue'

import Icon from '@/components/ui/Icon.vue'
import { useSettings } from '@/stores/settings'
import {
  RESULT_COUNT_MAX,
  RESULT_COUNT_MIN,
  SORT_MODES,
} from '@/types'
import type { SortMode } from '@/types'

/**
 * 设置面板 · 搜索偏好（PLAN 3.6）：
 * - 每次返回条数 1–50（默认 30），可直接输入或点快捷值；越界输入在失焦时收敛；
 * - 排序切换立即重排已有结果、不重新请求；条数在下次搜索时生效。
 */
const { settings, update } = useSettings()

const QUICK_COUNTS: readonly number[] = [5, 10, 20, 30, 50]

const SORT_LABELS: Record<SortMode, string> = {
  relevance: '相关度',
  latest: '最新',
}

const countDraft = ref(String(settings.resultCount))

watch(
  () => settings.resultCount,
  (value) => {
    if (countDraft.value !== String(value)) countDraft.value = String(value)
  },
)

function clampCount(value: number): number {
  return Math.min(RESULT_COUNT_MAX, Math.max(RESULT_COUNT_MIN, Math.round(value)))
}

function commitCount(): void {
  const parsed = Number.parseInt(countDraft.value, 10)
  const next = Number.isFinite(parsed) ? clampCount(parsed) : settings.resultCount
  countDraft.value = String(next)
  if (next !== settings.resultCount) update({ resultCount: next })
}

function onCountInput(event: Event): void {
  const input = event.target as HTMLInputElement
  countDraft.value = input.value
  const parsed = Number.parseInt(input.value, 10)
  if (
    Number.isFinite(parsed) &&
    parsed >= RESULT_COUNT_MIN &&
    parsed <= RESULT_COUNT_MAX &&
    parsed !== settings.resultCount
  ) {
    update({ resultCount: parsed })
  }
}

function stepCount(delta: number): void {
  const next = clampCount(settings.resultCount + delta)
  countDraft.value = String(next)
  if (next !== settings.resultCount) update({ resultCount: next })
}

function chooseCount(value: number): void {
  countDraft.value = String(value)
  if (settings.resultCount !== value) update({ resultCount: value })
}
</script>

<template>
  <section class="settings-section" aria-labelledby="settings-preferences-title">
    <div class="settings-section__head">
      <h3 id="settings-preferences-title" class="settings-section__title">搜索偏好</h3>
    </div>

    <div class="settings-group">
      <label class="settings-label" for="settings-result-count">每次返回条数</label>
      <div class="count-field">
        <button
          type="button"
          class="count-field__step"
          aria-label="减少返回条数"
          :disabled="settings.resultCount <= RESULT_COUNT_MIN"
          @click="stepCount(-1)"
        >
          <Icon name="minus" :size="14" />
        </button>
        <input
          id="settings-result-count"
          class="count-field__input"
          type="number"
          inputmode="numeric"
          :min="RESULT_COUNT_MIN"
          :max="RESULT_COUNT_MAX"
          step="1"
          :value="countDraft"
          @input="onCountInput"
          @change="commitCount"
          @blur="commitCount"
          @keydown.enter.prevent="commitCount"
        />
        <button
          type="button"
          class="count-field__step"
          aria-label="增加返回条数"
          :disabled="settings.resultCount >= RESULT_COUNT_MAX"
          @click="stepCount(1)"
        >
          <Icon name="plus" :size="14" />
        </button>
      </div>
      <div class="settings-chips" role="group" aria-label="常用条数">
        <button
          v-for="value in QUICK_COUNTS"
          :key="value"
          type="button"
          class="settings-chip"
          :aria-pressed="settings.resultCount === value"
          @click="chooseCount(value)"
        >
          {{ value }} 条
        </button>
      </div>
      <p class="settings-hint">范围 {{ RESULT_COUNT_MIN }}–{{ RESULT_COUNT_MAX }}，默认 30；下次搜索生效。</p>
    </div>

    <div class="settings-group">
      <span id="settings-sort-label" class="settings-label">结果排序</span>
      <div class="settings-options" role="group" aria-labelledby="settings-sort-label">
        <button
          v-for="mode in SORT_MODES"
          :key="mode"
          type="button"
          class="settings-option"
          :aria-pressed="settings.sortMode === mode"
          @click="update({ sortMode: mode })"
        >
          {{ SORT_LABELS[mode] }}
        </button>
      </div>
      <p class="settings-hint">排序立即重排当前结果，不会重新请求。</p>
    </div>
  </section>
</template>

<style scoped>
.count-field {
  display: inline-flex;
  align-items: stretch;
  width: fit-content;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--surface);
  overflow: hidden;
}

.count-field:focus-within {
  border-color: var(--brand);
  box-shadow: 0 0 0 3px var(--brand-soft);
}

.count-field__step {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 34px;
  color: var(--text-secondary);
  transition: background-color var(--transition-fast);
}

.count-field__step:hover:not(:disabled) {
  background: var(--surface-hover);
  color: var(--text);
}

.count-field__input {
  width: 64px;
  padding: 7px 0;
  border: none;
  background: transparent;
  color: var(--text);
  font-size: var(--text-sm);
  font-variant-numeric: tabular-nums;
  text-align: center;
  appearance: textfield;
  -moz-appearance: textfield;
}

.count-field__input::-webkit-outer-spin-button,
.count-field__input::-webkit-inner-spin-button {
  margin: 0;
  appearance: none;
  -webkit-appearance: none;
}

.count-field__input:focus {
  outline: none;
}
</style>
