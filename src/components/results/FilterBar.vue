<script setup lang="ts">
import { computed, reactive, ref } from 'vue'

import Icon from '@/components/ui/Icon.vue'
import Popover from '@/components/ui/Popover.vue'
import { useQueryRoute } from '@/composables/useQueryRoute'
import { useSearch } from '@/composables/useSearch'
import {
  MAX_QUERY_LENGTH,
  clearQueryFilters,
  countActiveFilters,
  countQueryChars,
  hasActiveFilters,
  isDateRangeValid,
  normalizeFilters,
  parseQuery,
  updateQueryFilters,
} from '@/lib/query'
import type { FilterGroupId } from '@/lib/query'

/**
 * 筛选项栏（PLAN 3.4）：搜索语法的可视化编辑器。
 *
 * - `q` 是唯一事实来源：chips 始终从当前 `q` 解析，用户直接输入语法后也同步更新；
 * - 每组 chip 可打开编辑弹层；应用后写回 `q` 并立即调用 `useSearch.run`；
 * - 站点输入归一化为 host；日期冲突只在弹层内提示，不发请求；
 * - 提供单组清除与“清除筛选”。
 */

interface FilterGroupDefinition {
  id: FilterGroupId
  label: string
  icon: string
  hint: string
  placeholder: string
  /** 编辑控件类型：多行 / 单行 / 日期区间 */
  editor: 'textarea' | 'input' | 'date'
}

const groups: readonly FilterGroupDefinition[] = [
  {
    id: 'sites',
    label: '站点',
    icon: 'globe',
    hint: '只搜索指定站点；多个站点用空格、逗号或换行分隔。',
    placeholder: 'example.com github.com',
    editor: 'textarea',
  },
  {
    id: 'excludedSites',
    label: '排除站点',
    icon: 'minus',
    hint: '排除指定站点；多个站点用空格、逗号或换行分隔。',
    placeholder: 'spam.com',
    editor: 'textarea',
  },
  {
    id: 'phrases',
    label: '短语',
    icon: 'message-circle',
    hint: '结果必须完整包含这些短语；每行一个。',
    placeholder: 'machine learning',
    editor: 'textarea',
  },
  {
    id: 'excludedWords',
    label: '排除词',
    icon: 'filter',
    hint: '排除这些关键词或短语；每行一个。',
    placeholder: '广告',
    editor: 'textarea',
  },
  {
    id: 'langs',
    label: '语言',
    icon: 'globe',
    hint: '语言代码，逗号分隔，例如 zh,en。',
    placeholder: 'zh,en',
    editor: 'input',
  },
  {
    id: 'date',
    label: '日期',
    icon: 'calendar',
    hint: '按发布时间筛选；仅填年份时按年初 / 年末处理。',
    placeholder: '',
    editor: 'date',
  },
]

const { query, navigate } = useQueryRoute()
const { run } = useSearch()

const filters = computed(() => parseQuery(query.value).filters)
const activeCount = computed(() => countActiveFilters(filters.value))
const showClear = computed(() => hasActiveFilters(filters.value))

const openGroup = ref<FilterGroupId | null>(null)
const groupError = ref('')

const drafts = reactive({
  sites: '',
  excludedSites: '',
  phrases: '',
  excludedWords: '',
  langs: '',
  after: '',
  before: '',
})

const dateDraftConflict = computed(() =>
  isDateRangeValid(drafts.after || null, drafts.before || null) ? null : '起始日期不能晚于结束日期',
)

/* -------------------------------------------------------------------------- */
/* chip 摘要                                                                   */
/* -------------------------------------------------------------------------- */

function groupValues(id: FilterGroupId): string[] {
  const current = filters.value
  switch (id) {
    case 'sites':
      return current.sites
    case 'excludedSites':
      return current.excludedSites
    case 'phrases':
      return current.phrases
    case 'excludedWords':
      return current.excludedWords
    case 'langs':
      return current.langs
    default:
      return [current.after, current.before].filter((value): value is string => Boolean(value))
  }
}

function hasGroupValue(id: FilterGroupId): boolean {
  return groupValues(id).length > 0
}

function groupSummary(id: FilterGroupId): string {
  const current = filters.value
  switch (id) {
    case 'sites':
      return current.sites.join('、')
    case 'excludedSites':
      return current.excludedSites.join('、')
    case 'phrases':
      return current.phrases.map((phrase) => `"${phrase}"`).join('、')
    case 'excludedWords':
      return current.excludedWords.join('、')
    case 'langs':
      return current.langs.join('、')
    default:
      if (current.after && current.before) return `${current.after} ~ ${current.before}`
      if (current.after) return `≥ ${current.after}`
      if (current.before) return `≤ ${current.before}`
      return ''
  }
}

/* -------------------------------------------------------------------------- */
/* 弹层开关与草稿同步                                                          */
/* -------------------------------------------------------------------------- */

function resetDrafts(): void {
  const current = filters.value
  drafts.sites = current.sites.join('\n')
  drafts.excludedSites = current.excludedSites.join('\n')
  drafts.phrases = current.phrases.join('\n')
  drafts.excludedWords = current.excludedWords.join('\n')
  drafts.langs = current.langs.join(',')
  drafts.after = current.after ?? ''
  drafts.before = current.before ?? ''
  groupError.value = ''
}

function setGroupOpen(id: FilterGroupId, open: boolean): void {
  if (open) {
    resetDrafts()
    openGroup.value = id
    return
  }
  if (openGroup.value === id) openGroup.value = null
  groupError.value = ''
}

function toggleGroup(id: FilterGroupId): void {
  if (openGroup.value === id) setGroupOpen(id, false)
  else setGroupOpen(id, true)
}

function onOpenChange(id: FilterGroupId, open: boolean): void {
  setGroupOpen(id, open)
}

/* -------------------------------------------------------------------------- */
/* 应用 / 清除                                                                 */
/* -------------------------------------------------------------------------- */

/** 空白、逗号、换行分隔的输入 → 去空数组（站点、语言等单值列表） */
function splitList(value: string): string[] {
  return value
    .split(/[\s,，、]+/u)
    .map((item) => item.trim())
    .filter(Boolean)
}

/** 仅按换行分隔（短语、排除词可以包含空格） */
function splitLines(value: string): string[] {
  return value
    .split(/\r?\n/u)
    .map((item) => item.trim())
    .filter(Boolean)
}

/** 写回 q 并立即搜索；空 q 回首页 */
function commit(next: string): void {
  // 筛选后查询仍受 128 字符限制：在弹层内提示，不发请求（PLAN 3.4）
  const length = countQueryChars(next)
  if (length > MAX_QUERY_LENGTH) {
    groupError.value = `搜索内容不能超过 ${MAX_QUERY_LENGTH} 个字符（当前 ${length} 个）`
    return
  }
  openGroup.value = null
  groupError.value = ''
  if (next === query.value) return
  if (!next) {
    navigate('')
    void run('')
    return
  }
  navigate(next)
  void run(next)
}

function applyGroup(id: FilterGroupId): void {
  groupError.value = ''
  switch (id) {
    case 'sites': {
      const sites = normalizeFilters({ sites: splitList(drafts.sites) }).sites
      if (sites.length === 0 && drafts.sites.trim()) {
        groupError.value = '请输入有效的站点域名，例如 example.com'
        return
      }
      commit(updateQueryFilters(query.value, { sites }))
      return
    }
    case 'excludedSites': {
      const excludedSites = normalizeFilters({
        excludedSites: splitList(drafts.excludedSites),
      }).excludedSites
      if (excludedSites.length === 0 && drafts.excludedSites.trim()) {
        groupError.value = '请输入有效的站点域名，例如 example.com'
        return
      }
      commit(updateQueryFilters(query.value, { excludedSites }))
      return
    }
    case 'phrases': {
      const phrases = normalizeFilters({ phrases: splitLines(drafts.phrases) }).phrases
      if (phrases.length === 0 && drafts.phrases.trim()) {
        groupError.value = '请输入至少一个非空短语'
        return
      }
      commit(updateQueryFilters(query.value, { phrases }))
      return
    }
    case 'excludedWords': {
      const excludedWords = normalizeFilters({
        excludedWords: splitLines(drafts.excludedWords),
      }).excludedWords
      if (excludedWords.length === 0 && drafts.excludedWords.trim()) {
        groupError.value = '请输入至少一个非空排除词'
        return
      }
      commit(updateQueryFilters(query.value, { excludedWords }))
      return
    }
    case 'langs': {
      const langs = normalizeFilters({ langs: splitList(drafts.langs) }).langs
      if (langs.length === 0 && drafts.langs.trim()) {
        groupError.value = '请输入有效的语言代码，例如 zh、en'
        return
      }
      commit(updateQueryFilters(query.value, { langs }))
      return
    }
    default: {
      if (dateDraftConflict.value) {
        groupError.value = dateDraftConflict.value
        return
      }
      commit(
        updateQueryFilters(query.value, {
          after: drafts.after || null,
          before: drafts.before || null,
        }),
      )
    }
  }
}

function clearGroup(id: FilterGroupId): void {
  switch (id) {
    case 'sites':
      commit(updateQueryFilters(query.value, { sites: [] }))
      return
    case 'excludedSites':
      commit(updateQueryFilters(query.value, { excludedSites: [] }))
      return
    case 'phrases':
      commit(updateQueryFilters(query.value, { phrases: [] }))
      return
    case 'excludedWords':
      commit(updateQueryFilters(query.value, { excludedWords: [] }))
      return
    case 'langs':
      commit(updateQueryFilters(query.value, { langs: [] }))
      return
    default:
      commit(updateQueryFilters(query.value, { after: null, before: null }))
  }
}

function clearAll(): void {
  commit(clearQueryFilters(query.value))
}
</script>

<template>
  <div class="filter-bar">
    <span class="filter-bar__label">
      <Icon name="filter" :size="15" />
      筛选
    </span>

    <div class="filter-bar__groups" role="group" aria-label="搜索筛选">
      <div v-for="group in groups" :key="group.id" class="filter-bar__group">
        <div
          class="filter-chip-wrap"
          :class="{ 'filter-chip-wrap--active': hasGroupValue(group.id) }"
        >
          <Popover
            :open="openGroup === group.id"
            align="start"
            :offset="8"
            panel-class="filter-bar__panel"
            @update:open="onOpenChange(group.id, $event)"
          >
            <template #trigger="{ open }">
              <button
                type="button"
                class="filter-chip"
                :aria-expanded="open"
                aria-haspopup="dialog"
                :title="group.hint"
                @click="toggleGroup(group.id)"
              >
                <Icon :name="group.icon" :size="14" />
                <span class="filter-chip__label">{{ group.label }}</span>
                <span v-if="hasGroupValue(group.id)" class="filter-chip__value">
                  {{ groupSummary(group.id) }}
                </span>
                <Icon v-else name="plus" :size="12" class="filter-chip__plus" />
              </button>
            </template>

            <div class="filter-panel" role="dialog" :aria-label="`${group.label}筛选`">
            <p class="filter-panel__title">{{ group.label }}</p>
            <p class="filter-panel__hint">{{ group.hint }}</p>

            <template v-if="group.id === 'sites'">
              <textarea
                v-model="drafts.sites"
                class="input filter-panel__textarea"
                rows="3"
                :placeholder="group.placeholder"
                aria-label="包含站点"
                @keydown.enter.exact.prevent="applyGroup('sites')"
              />
            </template>

            <template v-else-if="group.id === 'excludedSites'">
              <textarea
                v-model="drafts.excludedSites"
                class="input filter-panel__textarea"
                rows="3"
                :placeholder="group.placeholder"
                aria-label="排除站点"
                @keydown.enter.exact.prevent="applyGroup('excludedSites')"
              />
            </template>

            <template v-else-if="group.id === 'phrases'">
              <textarea
                v-model="drafts.phrases"
                class="input filter-panel__textarea"
                rows="3"
                :placeholder="group.placeholder"
                aria-label="精确短语"
                @keydown.enter.exact.prevent="applyGroup('phrases')"
              />
            </template>

            <template v-else-if="group.id === 'excludedWords'">
              <textarea
                v-model="drafts.excludedWords"
                class="input filter-panel__textarea"
                rows="3"
                :placeholder="group.placeholder"
                aria-label="排除关键词"
                @keydown.enter.exact.prevent="applyGroup('excludedWords')"
              />
            </template>

            <template v-else-if="group.id === 'langs'">
              <input
                v-model="drafts.langs"
                class="input"
                type="text"
                :placeholder="group.placeholder"
                aria-label="语言代码"
                @keydown.enter.prevent="applyGroup('langs')"
              />
            </template>

            <template v-else>
              <div class="filter-panel__dates">
                <label class="filter-panel__field">
                  <span>起始日期</span>
                  <input v-model="drafts.after" class="input" type="date" aria-label="起始日期" />
                </label>
                <label class="filter-panel__field">
                  <span>结束日期</span>
                  <input v-model="drafts.before" class="input" type="date" aria-label="结束日期" />
                </label>
              </div>
              <p v-if="dateDraftConflict" class="filter-panel__error" role="alert">
                {{ dateDraftConflict }}
              </p>
            </template>

            <p v-if="groupError" class="filter-panel__error" role="alert">{{ groupError }}</p>

            <div class="filter-panel__actions">
              <button
                v-if="hasGroupValue(group.id)"
                type="button"
                class="btn btn--ghost btn--sm"
                @click="clearGroup(group.id)"
              >
                清除
              </button>
              <span class="filter-panel__spacer" />
              <button
                type="button"
                class="btn btn--outline btn--sm"
                @click="setGroupOpen(group.id, false)"
              >
                取消
              </button>
              <button
                type="button"
                class="btn btn--primary btn--sm"
                :disabled="group.id === 'date' && Boolean(dateDraftConflict)"
                @click="applyGroup(group.id)"
              >
                应用
              </button>
            </div>
          </div>
          </Popover>
          <button
            v-if="hasGroupValue(group.id)"
            type="button"
            class="filter-chip__clear"
            :aria-label="`清除${group.label}筛选`"
            :title="`清除${group.label}筛选`"
            @click="clearGroup(group.id)"
          >
            <Icon name="close" :size="12" />
          </button>
        </div>
      </div>
    </div>

    <button v-if="showClear" type="button" class="filter-bar__clear" @click="clearAll">
      <Icon name="close" :size="13" />
      清除筛选（{{ activeCount }}）
    </button>
  </div>
</template>

<style scoped>
.filter-bar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-2);
  padding-bottom: var(--space-4);
  border-bottom: 1px solid var(--border);
}

.filter-bar__label {
  display: inline-flex;
  flex: none;
  align-items: center;
  gap: 5px;
  color: var(--text-muted);
  font-size: var(--text-xs);
  font-weight: 600;
}

.filter-bar__groups {
  display: flex;
  flex: 1 1 auto;
  flex-wrap: wrap;
  gap: 6px;
  min-width: 0;
}

.filter-bar__group {
  display: inline-flex;
}

.filter-chip-wrap {
  display: inline-flex;
  align-items: center;
  max-width: 340px;
  border: 1px dashed var(--border-strong);
  border-radius: var(--radius-pill);
  color: var(--text-muted);
  transition:
    border-color var(--transition-fast),
    background-color var(--transition-fast),
    color var(--transition-fast);
}

.filter-chip-wrap:hover {
  border-color: var(--text-muted);
  background: var(--surface-hover);
  color: var(--text);
}

.filter-chip-wrap--active {
  border-style: solid;
  border-color: var(--brand-soft-strong);
  background: var(--brand-soft);
  color: var(--brand);
}

.filter-chip-wrap--active:hover {
  border-color: var(--brand);
  background: var(--brand-soft-strong);
  color: var(--brand);
}

.filter-chip {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  max-width: 300px;
  padding: 5px 8px;
  border: none;
  background: transparent;
  color: inherit;
  font-size: var(--text-xs);
  line-height: 1.4;
}

.filter-chip__clear {
  display: inline-flex;
  flex: none;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  margin-right: 3px;
  border-radius: 50%;
  color: inherit;
  opacity: 0.75;
  transition:
    background-color var(--transition-fast),
    opacity var(--transition-fast);
}

.filter-chip__clear:hover {
  background: color-mix(in srgb, currentColor 16%, transparent);
  opacity: 1;
}

.filter-chip__label {
  flex: none;
  font-weight: 600;
}

.filter-chip__value {
  max-width: 170px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.filter-chip__plus {
  flex: none;
  opacity: 0.7;
}

.filter-bar__clear {
  display: inline-flex;
  flex: none;
  align-items: center;
  gap: 4px;
  margin-left: auto;
  padding: 4px 8px;
  border-radius: var(--radius-sm);
  color: var(--text-muted);
  font-size: var(--text-xs);
  transition:
    background-color var(--transition-fast),
    color var(--transition-fast);
}

.filter-bar__clear:hover {
  background: var(--surface-hover);
  color: var(--danger);
}

.filter-bar__group :deep(.filter-bar__panel) {
  padding: 0;
}

.filter-panel {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  width: min(92vw, 300px);
  padding: var(--space-4);
  text-align: left;
}

.filter-panel__title {
  font-size: var(--text-sm);
  font-weight: 700;
}

.filter-panel__hint {
  margin-top: calc(-1 * var(--space-1));
  color: var(--text-muted);
  font-size: var(--text-xs);
  line-height: 1.5;
}

.filter-panel__textarea {
  min-height: 74px;
  resize: vertical;
  font-size: var(--text-sm);
  line-height: 1.5;
}

.filter-panel__dates {
  display: flex;
  gap: var(--space-2);
}

.filter-panel__field {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
  color: var(--text-muted);
  font-size: var(--text-xs);
}

.filter-panel__field .input {
  font-size: var(--text-sm);
}

.filter-panel__error {
  color: var(--danger);
  font-size: var(--text-xs);
}

.filter-panel__actions {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  margin-top: var(--space-1);
}

.filter-panel__spacer {
  flex: 1 1 auto;
}

@media (max-width: 768px) {
  .filter-chip__value {
    max-width: 110px;
  }

  .filter-bar__clear {
    margin-left: 0;
  }
}
</style>
