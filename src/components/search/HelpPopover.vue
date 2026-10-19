<script setup lang="ts">
import { onBeforeUnmount, ref, watch } from 'vue'

import Icon from '@/components/ui/Icon.vue'
import Popover from '@/components/ui/Popover.vue'

/**
 * 搜索语法帮助浮窗（PLAN 3.2）。
 *
 * 交互：hover 延迟打开、点击固定、点击外部 / Esc 关闭。
 * 外部点击与 Esc 由共享 Popover 处理，本组件只维护 hover 计时与“固定”状态。
 */
const HOVER_OPEN_DELAY = 260
const HOVER_CLOSE_DELAY = 160

const DOCS_URL = 'https://api-docs.deepseek.com/zh-cn/'

interface SyntaxRow {
  syntax: string
  description: string
}

const syntaxRows: readonly SyntaxRow[] = [
  { syntax: 'site:a.com', description: '只搜索指定站点' },
  { syntax: 'site:a OR site:b', description: '包含多个站点（用 OR 连接）' },
  { syntax: '-site:a.com', description: '排除指定站点' },
  { syntax: '"精确短语"', description: '结果必须包含完整短语' },
  { syntax: '-word', description: '排除单个关键词' },
  { syntax: '-"排除短语"', description: '排除含空格的短语' },
  { syntax: 'lang:zh,en', description: '限定语言，逗号分隔' },
  { syntax: 'after:2024', description: '起始日期，仅年份按 2024-01-01 处理' },
  { syntax: 'before:2024', description: '结束日期，仅年份按 2024-12-31 处理' },
]

const open = ref(false)
const pinned = ref(false)
let openTimer: ReturnType<typeof setTimeout> | null = null
let closeTimer: ReturnType<typeof setTimeout> | null = null

function clearOpenTimer(): void {
  if (openTimer !== null) {
    clearTimeout(openTimer)
    openTimer = null
  }
}

function clearCloseTimer(): void {
  if (closeTimer !== null) {
    clearTimeout(closeTimer)
    closeTimer = null
  }
}

function clearTimers(): void {
  clearOpenTimer()
  clearCloseTimer()
}

function onPointerEnter(): void {
  clearCloseTimer()
  if (open.value || openTimer !== null) return
  openTimer = setTimeout(() => {
    openTimer = null
    open.value = true
  }, HOVER_OPEN_DELAY)
}

function onPointerLeave(): void {
  clearOpenTimer()
  if (pinned.value) return
  clearCloseTimer()
  closeTimer = setTimeout(() => {
    closeTimer = null
    open.value = false
  }, HOVER_CLOSE_DELAY)
}

function onTriggerClick(): void {
  clearTimers()
  if (open.value && pinned.value) {
    open.value = false
    pinned.value = false
    return
  }
  open.value = true
  pinned.value = true
}

watch(open, (value) => {
  if (!value) {
    pinned.value = false
    clearTimers()
  }
})

onBeforeUnmount(clearTimers)
</script>

<template>
  <div class="help-popover" @mouseenter="onPointerEnter" @mouseleave="onPointerLeave">
    <Popover
      v-model:open="open"
      align="end"
      :offset="10"
      panel-class="help-popover__panel"
    >
      <template #trigger="{ open: isOpen }">
        <button
          type="button"
          class="icon-btn help-popover__trigger"
          :class="{ 'help-popover__trigger--active': isOpen }"
          :aria-label="isOpen ? '收起搜索语法帮助' : '查看搜索语法帮助'"
          aria-haspopup="dialog"
          :aria-expanded="isOpen"
          title="搜索语法帮助"
          @click="onTriggerClick"
        >
          <Icon name="help-circle" :size="19" />
        </button>
      </template>

      <div class="help" role="dialog" aria-label="搜索语法帮助" @click.stop>
        <h2 class="help__title">搜索语法</h2>
        <p class="help__intro">语法可组合使用，直接输入到搜索框即可；筛选栏会把它们可视化。</p>
        <dl class="help__list">
          <div v-for="row in syntaxRows" :key="row.syntax" class="help__row">
            <dt class="help__syntax"><code>{{ row.syntax }}</code></dt>
            <dd class="help__description">{{ row.description }}</dd>
          </div>
        </dl>
        <p class="help__example">
          <span class="help__example-label">示例</span>
          <code>DeepSeek site:github.com lang:zh after:2024</code>
        </p>
        <a class="help__docs" :href="DOCS_URL" target="_blank" rel="noopener noreferrer">
          查看 DeepSeek 官方文档
          <Icon name="external-link" :size="14" />
        </a>
      </div>
    </Popover>
  </div>
</template>

<style scoped>
.help-popover {
  display: inline-flex;
  flex: none;
}

.help-popover__trigger--active {
  background: var(--surface-hover);
  color: var(--text);
}

.help-popover :deep(.help-popover__panel) {
  width: min(92vw, 400px);
  padding: 0;
  overflow: hidden;
}

.help {
  max-height: min(70vh, 520px);
  padding: var(--space-4);
  overflow-y: auto;
  text-align: left;
}

.help__title {
  font-size: var(--text-base);
  font-weight: 700;
}

.help__intro {
  margin-top: var(--space-1);
  color: var(--text-muted);
  font-size: var(--text-xs);
  line-height: 1.5;
}

.help__list {
  display: flex;
  flex-direction: column;
  gap: 2px;
  margin-top: var(--space-3);
}

.help__row {
  display: grid;
  grid-template-columns: minmax(0, 0.95fr) minmax(0, 1.05fr);
  align-items: baseline;
  gap: var(--space-3);
  padding: 5px 0;
  border-bottom: 1px solid var(--border);
}

.help__row:last-child {
  border-bottom: none;
}

.help__syntax {
  min-width: 0;
}

.help__syntax code,
.help__example code {
  display: inline-block;
  padding: 1px 5px;
  border-radius: var(--radius-xs);
  background: var(--bg-inset);
  color: var(--text);
  font-family: var(--font-mono);
  font-size: var(--text-xs);
  overflow-wrap: anywhere;
}

.help__description {
  color: var(--text-secondary);
  font-size: var(--text-xs);
  line-height: 1.5;
}

.help__example {
  margin-top: var(--space-3);
  color: var(--text-muted);
  font-size: var(--text-xs);
}

.help__example-label {
  margin-right: var(--space-1);
  font-weight: 600;
}

.help__docs {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  margin-top: var(--space-3);
  font-size: var(--text-xs);
  font-weight: 600;
}

@media (max-width: 480px) {
  .help__row {
    grid-template-columns: minmax(0, 1fr);
    gap: 2px;
  }
}
</style>
