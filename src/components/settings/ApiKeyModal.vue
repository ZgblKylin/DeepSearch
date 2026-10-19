<script setup lang="ts">
import { nextTick, ref, watch } from 'vue'

import BaseModal from '@/components/ui/BaseModal.vue'
import Icon from '@/components/ui/Icon.vue'
import { useSettings } from '@/stores/settings'
import { useUi } from '@/stores/ui'

/**
 * 配置 DeepSeek API Key 弹窗（PLAN 3.7）：
 * - 密码输入 + 显示/隐藏；
 * - 保存 / 点击外部 / Esc 关闭；
 * - 空值不可保存；
 * - 保存成功后由 `useUi().saveApiKey` 自动执行被拦截的操作（pendingAction）。
 */
const API_KEY_URL = 'https://platform.deepseek.com/api_keys'

const { settings } = useSettings()
const { ui, closeApiKeyModal, saveApiKey } = useUi()

const inputRef = ref<HTMLInputElement | null>(null)
const keyDraft = ref('')
const visible = ref(false)
const errorMessage = ref('')

watch(
  () => ui.apiKeyModal.open,
  (open) => {
    if (!open) return
    keyDraft.value = settings.apiKey
    visible.value = false
    errorMessage.value = ''
    void nextTick(() => inputRef.value?.focus())
  },
  { immediate: true },
)

function submit(): void {
  const key = keyDraft.value.trim()
  if (!key) {
    errorMessage.value = '请输入 API Key 后再保存'
    return
  }
  errorMessage.value = ''
  saveApiKey(key)
}
</script>

<template>
  <BaseModal
    :open="ui.apiKeyModal.open"
    title="配置 DeepSeek API Key"
    subtitle="DeepSearch 直接从浏览器调用 DeepSeek API，Key 仅保存在本机浏览器。"
    size="sm"
    initial-focus="#api-key-input"
    @close="closeApiKeyModal"
  >
    <form class="api-key" novalidate @submit.prevent="submit">
      <label class="api-key__label" for="api-key-input">API Key</label>
      <div class="api-key__field" :class="{ 'api-key__field--error': errorMessage }">
        <Icon name="key" :size="16" class="api-key__field-icon" />
        <input
          id="api-key-input"
          ref="inputRef"
          v-model="keyDraft"
          :type="visible ? 'text' : 'password'"
          class="api-key__input"
          name="api-key"
          placeholder="sk-..."
          autocomplete="off"
          autocapitalize="off"
          spellcheck="false"
          aria-describedby="api-key-hint"
          @keydown.enter.prevent="submit"
        />
        <button
          type="button"
          class="api-key__eye"
          :aria-label="visible ? '隐藏 API Key' : '显示 API Key'"
          :aria-pressed="visible"
          @click="visible = !visible"
        >
          <Icon :name="visible ? 'eye-off' : 'eye'" :size="16" />
        </button>
      </div>

      <p v-if="errorMessage" class="api-key__error" role="alert">{{ errorMessage }}</p>

      <p id="api-key-hint" class="api-key__hint">
        还没有 Key？
        <a :href="API_KEY_URL" target="_blank" rel="noopener noreferrer">
          前往 DeepSeek 开放平台获取
          <Icon name="external-link" :size="12" class="api-key__link-icon" />
        </a>
      </p>
      <p class="api-key__privacy">
        保存后立即生效；本地存储，不上传、不追踪。若浏览器禁用 localStorage，Key
        仅在当前会话内有效。
      </p>
    </form>

    <template #footer>
      <button type="button" class="btn btn--outline" @click="closeApiKeyModal">取消</button>
      <button
        type="button"
        class="btn btn--primary"
        :disabled="!keyDraft.trim()"
        @click="submit"
      >
        保存
      </button>
    </template>
  </BaseModal>
</template>

<style scoped>
.api-key {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.api-key__label {
  color: var(--text-secondary);
  font-size: var(--text-sm);
  font-weight: 600;
}

.api-key__field {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding: 0 var(--space-2) 0 var(--space-3);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--surface);
  transition:
    border-color var(--transition-fast),
    box-shadow var(--transition-fast);
}

.api-key__field:focus-within {
  border-color: var(--brand);
  box-shadow: 0 0 0 3px var(--brand-soft);
}

.api-key__field--error {
  border-color: var(--danger);
}

.api-key__field-icon {
  flex: none;
  color: var(--text-muted);
}

.api-key__input {
  flex: 1 1 auto;
  min-width: 0;
  padding: 9px 0;
  border: none;
  background: transparent;
  color: var(--text);
  font-family: var(--font-mono);
  font-size: var(--text-sm);
}

.api-key__input:focus {
  outline: none;
}

.api-key__eye {
  display: inline-flex;
  flex: none;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  border-radius: var(--radius-xs);
  color: var(--text-muted);
}

.api-key__eye:hover {
  background: var(--surface-hover);
  color: var(--text);
}

.api-key__error {
  color: var(--danger);
  font-size: var(--text-xs);
}

.api-key__hint,
.api-key__privacy {
  color: var(--text-muted);
  font-size: var(--text-xs);
  line-height: 1.7;
}

.api-key__hint a {
  display: inline-flex;
  align-items: center;
  gap: 2px;
}

.api-key__link-icon {
  display: inline-block;
  margin-left: 2px;
}
</style>
