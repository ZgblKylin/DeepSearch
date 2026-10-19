<script setup lang="ts">
/**
 * AI 对话线程：第一条助手消息是搜索摘要，之后直接在同一线程中追问。
 *
 * 结果卡片上的“AI 追问”按钮会在外层重置会话并生成新的第一条消息；
 * 本组件只负责渲染消息、标签、输入框与错误重试。
 */
import { computed, nextTick, ref, watch } from 'vue'

import type { AiPhase, AiSource, ChatMessage } from '@/types'
import AiSummary from './AiSummary.vue'
import ChatMessageView from './ChatMessage.vue'
import Icon from '@/components/ui/Icon.vue'
import LoadingDots from '@/components/ui/LoadingDots.vue'

const props = withDefaults(
  defineProps<{
    phase: AiPhase
    messages: readonly ChatMessage[]
    sources?: readonly AiSource[]
    /** 部分网页读取失败等提示 */
    notice?: string
    /** 是否正在等待 AI 回答 */
    asking?: boolean
    /** 追问阶段的错误文案 */
    error?: string
    /** 第一条助手消息是否显示搜索摘要标签行 */
    showSummaryTags?: boolean
    /** rerank_score >= 1.5 的结果数 */
    excellentCount?: number
    /** authority >= 3 的结果数 */
    authorityCount?: number
  }>(),
  {
    sources: () => [],
    notice: '',
    asking: false,
    error: '',
    showSummaryTags: false,
    excellentCount: 0,
    authorityCount: 0,
  },
)

const emit = defineEmits<{
  ask: [text: string]
  retry: []
}>()

const draft = ref('')
const composing = ref(false)
const threadEl = ref<HTMLElement | null>(null)

const canAsk = computed(
  () =>
    (props.phase === 'ready' || props.phase === 'followup-ready') &&
    !props.asking,
)

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
  if (!canAsk.value) return
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
  <section class="ai-chat" aria-label="AI 对话">
    <p v-if="notice" class="ai-chat__notice" role="status">
      <Icon name="info" :size="14" />
      <span>{{ notice }}</span>
    </p>

    <div ref="threadEl" class="ai-chat__thread" aria-live="polite">
      <template v-for="(message, index) in messages" :key="`${index}-${message.role}`">
        <div
          v-if="index === 0 && showSummaryTags && message.role === 'assistant'"
          class="ai-chat__first"
        >
          <div class="ai-chat__avatar" aria-hidden="true">AI</div>
          <AiSummary
            :content="message.content"
            :sources="sources"
            :excellent-count="excellentCount"
            :authority-count="authorityCount"
          />
        </div>
        <ChatMessageView v-else :message="message" :sources="sources" />
      </template>

      <div v-if="asking" class="ai-chat__pending" role="status" aria-label="AI 正在回答">
        <span class="ai-chat__pending-avatar" aria-hidden="true">AI</span>
        <LoadingDots size="sm" label="AI 正在回答" />
      </div>
    </div>

    <div v-if="error && !asking" class="ai-chat__error" role="alert">
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
        :placeholder="canAsk ? '继续对话…（Enter 发送，Shift+Enter 换行）' : '正在生成回答…'"
        aria-label="对话输入框"
        @keydown="onKeydown"
        @compositionstart="onCompositionStart"
        @compositionend="onCompositionEnd"
      ></textarea>
      <button
        type="submit"
        class="btn btn--primary ai-chat__send"
        :disabled="!canAsk || !draft.trim()"
        aria-label="发送消息"
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

.ai-chat__thread {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  max-height: min(46vh, 420px);
  overflow-y: auto;
  overscroll-behavior: contain;
}

.ai-chat__first {
  display: flex;
  align-items: flex-start;
  gap: var(--space-2);
  width: 100%;
}

.ai-chat__first :deep(.ai-summary) {
  flex: 1 1 auto;
  min-width: 0;
}

.ai-chat__avatar {
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
  line-height: 1;
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
