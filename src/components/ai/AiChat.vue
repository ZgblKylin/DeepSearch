<script setup lang="ts">
/**
 * AI 追问会话（PLAN 3.5）：
 * - 头部显示来源数量与“重新开始”；
 * - Fetch 阶段显示“正在读取网页 n/3”，随后显示背景摘要生成进度；
 * - 多轮对话：Enter 发送、Shift+Enter 换行，加载中禁用输入；
 * - 错误内联展示并可重试。
 */
import { computed, nextTick, ref, watch } from 'vue'

import type { AiPhase, AiSource, ChatMessage } from '@/types'
import ChatMessageView from './ChatMessage.vue'
import Icon from '@/components/ui/Icon.vue'
import LoadingDots from '@/components/ui/LoadingDots.vue'

const props = withDefaults(
  defineProps<{
    phase: AiPhase
    messages: readonly ChatMessage[]
    sources?: readonly AiSource[]
    /** 是否正在读取网页 */
    fetching?: boolean
    fetchCompleted?: number
    fetchTotal?: number
    /** 部分网页读取失败等提示 */
    notice?: string
    /** 是否正在等待 AI 回答 */
    asking?: boolean
    /** 追问阶段的错误文案 */
    error?: string
  }>(),
  {
    sources: () => [],
    fetching: false,
    fetchCompleted: 0,
    fetchTotal: 0,
    notice: '',
    asking: false,
    error: '',
  },
)

const emit = defineEmits<{
  ask: [text: string]
  restart: []
  retry: []
}>()

const draft = ref('')
const composing = ref(false)
const threadEl = ref<HTMLElement | null>(null)

const loading = computed(() => props.phase === 'followup-loading')
const canAsk = computed(() => props.phase === 'followup-ready' && !props.asking)
const canRestart = computed(() => !loading.value && !props.asking)

const loadingLabel = computed(() => {
  if (!props.fetching) return '正在生成追问摘要'
  if (props.fetchTotal <= 0) return '正在读取网页'
  const current = Math.min(props.fetchCompleted + 1, props.fetchTotal)
  return `正在读取网页 ${current}/${props.fetchTotal}`
})

function scrollToBottom(): void {
  const element = threadEl.value
  if (!element) return
  element.scrollTop = element.scrollHeight
}

watch(
  () => [props.messages.length, props.asking, props.phase] as const,
  async () => {
    await nextTick()
    scrollToBottom()
  },
)

function submit(): void {
  if (!canAsk.value || props.asking) return
  const text = draft.value.trim()
  if (!text) return
  draft.value = ''
  emit('ask', text)
}

function onKeydown(event: KeyboardEvent): void {
  if (event.key !== 'Enter' || event.shiftKey) return
  // 输入法组词中（中文/日文）不触发发送
  if (event.isComposing || composing.value) return
  event.preventDefault()
  submit()
}

function onCompositionStart(): void {
  composing.value = true
}

function onCompositionEnd(): void {
  composing.value = false
}
</script>

<template>
  <section class="ai-chat" aria-label="AI 追问">
    <header class="ai-chat__header">
      <div class="ai-chat__heading">
        <span class="ai-chat__title">AI 追问</span>
        <span v-if="sources.length > 0" class="ai-chat__source-count">
          共 {{ sources.length }} 个来源
        </span>
      </div>
      <button
        type="button"
        class="btn btn--ghost btn--sm ai-chat__restart"
        :disabled="!canRestart"
        @click="emit('restart')"
      >
        <Icon name="rotate-ccw" :size="14" />
        <span>重新开始</span>
      </button>
    </header>

    <p v-if="notice" class="ai-chat__notice" role="status">
      <Icon name="info" :size="14" />
      <span>{{ notice }}</span>
    </p>

    <p v-if="loading" class="ai-chat__progress" role="status" aria-live="polite">
      <LoadingDots size="sm" :label="loadingLabel" />
      <span>{{ loadingLabel }}</span>
    </p>

    <div ref="threadEl" class="ai-chat__thread" aria-live="polite">
      <ChatMessageView
        v-for="(message, index) in messages"
        :key="`${index}-${message.role}`"
        :message="message"
        :sources="sources"
      />

      <div v-if="asking" class="ai-chat__pending" role="status" aria-label="AI 正在回答">
        <span class="ai-chat__pending-avatar" aria-hidden="true">AI</span>
        <LoadingDots size="sm" label="AI 正在回答" />
      </div>
    </div>

    <div v-if="error && !loading" class="ai-chat__error" role="alert">
      <Icon name="alert-circle" :size="16" />
      <p class="ai-chat__error-text">{{ error }}</p>
      <button type="button" class="btn btn--outline btn--sm" @click="emit('retry')">
        <Icon name="refresh-cw" :size="13" />
        <span>重试</span>
      </button>
    </div>

    <form class="ai-chat__composer" @submit.prevent="submit">
      <textarea
        v-model="draft"
        class="input ai-chat__input"
        rows="2"
        :disabled="!canAsk"
        :placeholder="canAsk ? '继续追问…（Enter 发送，Shift+Enter 换行）' : '正在准备追问上下文…'"
        aria-label="追问输入框"
        @keydown="onKeydown"
        @compositionstart="onCompositionStart"
        @compositionend="onCompositionEnd"
      ></textarea>
      <button
        type="submit"
        class="btn btn--primary ai-chat__send"
        :disabled="!canAsk || !draft.trim()"
        aria-label="发送追问"
      >
        <Icon name="send" :size="16" />
      </button>
    </form>
  </section>
</template>

<style scoped>
.ai-chat {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

.ai-chat__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-2);
}

.ai-chat__heading {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: var(--space-1) var(--space-2);
  min-width: 0;
}

.ai-chat__title {
  color: var(--text);
  font-size: var(--text-sm);
  font-weight: 700;
}

.ai-chat__source-count {
  color: var(--text-muted);
  font-size: var(--text-xs);
}

.ai-chat__restart {
  flex: 0 0 auto;
  gap: 4px;
}

.ai-chat__notice {
  display: flex;
  align-items: flex-start;
  gap: var(--space-1);
  padding: var(--space-2);
  border-radius: var(--radius-sm);
  background: var(--warning-soft);
  color: var(--warning);
  font-size: var(--text-xs);
  line-height: 1.5;
}

.ai-chat__notice :deep(svg) {
  flex: 0 0 auto;
  margin-top: 2px;
}

.ai-chat__progress {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-2) var(--space-3);
  border-radius: var(--radius-sm);
  background: var(--bg-subtle);
  color: var(--text-secondary);
  font-size: var(--text-xs);
}

.ai-chat__thread {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  max-height: min(46vh, 420px);
  overflow-y: auto;
  overscroll-behavior: contain;
}

.ai-chat__pending {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  color: var(--text-muted);
}

.ai-chat__pending-avatar {
  display: inline-flex;
  flex: 0 0 auto;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border-radius: 50%;
  background: var(--brand);
  color: var(--brand-contrast);
  font-size: 10px;
  font-weight: 700;
}

.ai-chat__error {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: var(--space-2);
  padding: var(--space-2) var(--space-3);
  border-radius: var(--radius-sm);
  background: var(--danger-soft);
  color: var(--danger);
  font-size: var(--text-xs);
}

.ai-chat__error-text {
  flex: 1 1 160px;
  min-width: 0;
  overflow-wrap: anywhere;
}

.ai-chat__composer {
  display: flex;
  align-items: flex-end;
  gap: var(--space-2);
}

.ai-chat__input {
  flex: 1 1 auto;
  min-height: 44px;
  max-height: 120px;
  resize: vertical;
  font-size: var(--text-sm);
  line-height: 1.6;
}

.ai-chat__send {
  flex: 0 0 auto;
  width: 40px;
  height: 40px;
  padding: 0;
  border-radius: var(--radius-sm);
}
</style>
