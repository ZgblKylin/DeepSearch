<script setup lang="ts">
/**
 * 单条会话消息：用户消息为纯文本气泡，助手消息走 Markdown 渲染并支持来源引用。
 */
import type { AiSource, ChatMessage } from '@/types'
import MarkdownView from './MarkdownView.vue'

withDefaults(
  defineProps<{
    message: ChatMessage
    /** 当前会话来源，用于 [n] 引用 */
    sources?: readonly AiSource[]
  }>(),
  { sources: () => [] },
)
</script>

<template>
  <article class="chat-message" :class="`chat-message--${message.role}`">
    <div v-if="message.role === 'user'" class="chat-message__user">
      {{ message.content }}
    </div>
    <div v-else class="chat-message__assistant">
      <div class="chat-message__avatar" aria-hidden="true">AI</div>
      <div class="chat-message__content">
        <MarkdownView :content="message.content" :sources="sources" />
      </div>
    </div>
  </article>
</template>

<style scoped>
.chat-message {
  display: flex;
  width: 100%;
}

.chat-message--user {
  justify-content: flex-end;
}

.chat-message__user {
  max-width: 88%;
  padding: var(--space-2) var(--space-3);
  border-radius: var(--radius-md) var(--radius-md) var(--radius-xs) var(--radius-md);
  background: var(--brand-soft);
  color: var(--text);
  font-size: var(--text-sm);
  line-height: 1.6;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

.chat-message--assistant {
  justify-content: flex-start;
}

.chat-message__assistant {
  display: flex;
  align-items: flex-start;
  gap: var(--space-2);
  width: 100%;
}

.chat-message__avatar {
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

.chat-message__content {
  min-width: 0;
  padding-top: 1px;
}
</style>
