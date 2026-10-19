<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'

import Icon from '@/components/ui/Icon.vue'
import LoadingDots from '@/components/ui/LoadingDots.vue'
import { testApiKey } from '@/lib/api'
import { formatElapsed } from '@/lib/format'
import { useSettings } from '@/stores/settings'
import { useUi } from '@/stores/ui'
import { AI_MODELS, REASONING_EFFORTS } from '@/types'
import type { AiModel, ReasoningEffort } from '@/types'

/**
 * 设置面板 · 连接配置（PLAN 3.6）：
 * - API Key 密码框 + 显示/隐藏；输入防抖 600ms、失焦立即写入；
 * - 测试连接使用当前输入框 Key（不要求先保存）调 `GET /models`；
 * - AI 模型与思考挡位单选，修改立即持久化，下次请求生效。
 */
const { settings, update } = useSettings()
const { showError } = useUi()

const MODEL_META: Record<AiModel, { title: string; desc: string }> = {
  'deepseek-flash': { title: 'DeepSeek Flash', desc: '快速、经济，适合日常搜索摘要' },
  'deepseek-v4-pro': { title: 'DeepSeek V4 Pro', desc: '能力更强，复杂问题更稳' },
}

const EFFORT_LABELS: Record<ReasoningEffort, string> = {
  off: '关闭',
  low: '低',
  high: '高',
  max: '最高',
}

const KEY_DEBOUNCE_MS = 600

const keyDraft = ref(settings.apiKey)
const keyVisible = ref(false)
/** 草稿是否有未落盘的用户输入（用于卸载时安全 flush，避免覆盖“清空数据”） */
const keyDirty = ref(false)
let keyTimer: ReturnType<typeof setTimeout> | null = null

type TestState = 'idle' | 'testing' | 'success' | 'error'

const testState = ref<TestState>('idle')
const testMessage = ref('')

const canTest = computed(
  () => keyDraft.value.trim().length > 0 && testState.value !== 'testing',
)

function cancelKeyTimer(): void {
  if (keyTimer !== null) {
    clearTimeout(keyTimer)
    keyTimer = null
  }
}

function persistKey(): void {
  cancelKeyTimer()
  keyDirty.value = false
  const next = keyDraft.value.trim()
  if (next === settings.apiKey) return
  update({ apiKey: next })
}

function onKeyInput(): void {
  keyDirty.value = true
  cancelKeyTimer()
  if (testState.value !== 'testing') {
    testState.value = 'idle'
    testMessage.value = ''
  }
  keyTimer = setTimeout(persistKey, KEY_DEBOUNCE_MS)
}

function onKeyBlur(): void {
  persistKey()
}

watch(
  () => settings.apiKey,
  (value) => {
    // 外部变化（Key 弹窗保存 / 清空数据）同步到输入框；相同值不打断正在输入的内容
    if (value === keyDraft.value.trim()) return
    keyDraft.value = value
    keyDirty.value = false
  },
)

async function runTest(): Promise<void> {
  const key = keyDraft.value.trim()
  if (!key || testState.value === 'testing') return
  testState.value = 'testing'
  testMessage.value = ''
  try {
    const { models, elapsedMs } = await testApiKey(key)
    if (key !== keyDraft.value.trim()) {
      testState.value = 'idle'
      return
    }
    testState.value = 'success'
    testMessage.value = `连接成功 · ${models.length} 个模型可用 · 耗时 ${formatElapsed(elapsedMs)}`
  } catch (error) {
    if (key !== keyDraft.value.trim()) {
      testState.value = 'idle'
      return
    }
    testState.value = 'error'
    testMessage.value = '连接失败，请检查 Key 或网络后重试'
    showError(error, 'test')
  }
}

onBeforeUnmount(() => {
  cancelKeyTimer()
  // 只在草稿有未落盘输入时 flush；否则可能把“清空数据”重置后的空 Key 覆盖回旧值
  if (!keyDirty.value) return
  const next = keyDraft.value.trim()
  if (next !== settings.apiKey) update({ apiKey: next })
})
</script>

<template>
  <section class="settings-section" aria-labelledby="settings-connection-title">
    <div class="settings-section__head">
      <h3 id="settings-connection-title" class="settings-section__title">连接配置</h3>
    </div>
    <p class="settings-section__desc">
      DeepSearch 由浏览器直接请求 DeepSeek API，无需服务端。
    </p>

    <form class="settings-group" novalidate @submit.prevent="onKeyBlur">
      <label class="settings-label" for="settings-api-key">API Key</label>
      <div
        class="key-field"
        :class="{
          'key-field--error': testState === 'error',
          'key-field--success': testState === 'success',
        }"
      >
        <Icon name="key" :size="16" class="key-field__icon" />
        <input
          id="settings-api-key"
          v-model="keyDraft"
          :type="keyVisible ? 'text' : 'password'"
          class="key-field__input"
          name="deepsearch-api-key"
          placeholder="sk-..."
          autocomplete="off"
          autocapitalize="off"
          spellcheck="false"
          aria-describedby="settings-api-key-hint"
          @input="onKeyInput"
          @blur="onKeyBlur"
        />
        <button
          type="button"
          class="key-field__eye"
          :aria-label="keyVisible ? '隐藏 API Key' : '显示 API Key'"
          :aria-pressed="keyVisible"
          @click="keyVisible = !keyVisible"
        >
          <Icon :name="keyVisible ? 'eye-off' : 'eye'" :size="16" />
        </button>
      </div>

      <div class="settings-inline">
        <button
          type="button"
          class="btn btn--outline btn--sm"
          :disabled="!canTest"
          :aria-busy="testState === 'testing'"
          @click="runTest"
        >
          <LoadingDots v-if="testState === 'testing'" size="sm" label="正在测试连接" />
          <Icon v-else name="zap" :size="14" />
          <span>{{ testState === 'testing' ? '正在测试…' : '测试连接' }}</span>
        </button>
        <span
          v-if="testState === 'success' || testState === 'error'"
          class="settings-status"
          :class="`settings-status--${testState}`"
          role="status"
        >
          <Icon :name="testState === 'success' ? 'check' : 'alert-circle'" :size="14" />
          <span>{{ testMessage }}</span>
        </span>
      </div>

      <p id="settings-api-key-hint" class="settings-hint">
        Key 仅保存在浏览器 localStorage，不会上传到本站。测试连接使用当前输入内容调用
        GET /models，不产生 token 费用，未保存也可测试。
      </p>
    </form>

    <div class="settings-group">
      <span id="settings-model-label" class="settings-label">AI 模型</span>
      <div class="settings-options" role="group" aria-labelledby="settings-model-label">
        <button
          v-for="model in AI_MODELS"
          :key="model"
          type="button"
          class="settings-option"
          :aria-pressed="settings.aiModel === model"
          @click="update({ aiModel: model })"
        >
          <span>{{ MODEL_META[model].title }}</span>
          <span class="settings-option__desc">{{ MODEL_META[model].desc }}</span>
        </button>
      </div>
    </div>

    <div class="settings-group">
      <span id="settings-effort-label" class="settings-label">思考挡位</span>
      <div class="settings-options" role="group" aria-labelledby="settings-effort-label">
        <button
          v-for="effort in REASONING_EFFORTS"
          :key="effort"
          type="button"
          class="settings-option"
          :aria-pressed="settings.reasoningEffort === effort"
          @click="update({ reasoningEffort: effort })"
        >
          {{ EFFORT_LABELS[effort] }}
        </button>
      </div>
      <p class="settings-hint">
        挡位越高思考越充分，耗时与费用也越高；“关闭”时不启用思考。模型与挡位在下次 AI
        请求时生效。
      </p>
    </div>
  </section>
</template>

<style scoped>
.key-field {
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

.key-field:focus-within {
  border-color: var(--brand);
  box-shadow: 0 0 0 3px var(--brand-soft);
}

.key-field--error {
  border-color: var(--danger);
}

.key-field--success {
  border-color: var(--success);
}

.key-field__icon {
  flex: none;
  color: var(--text-muted);
}

.key-field__input {
  flex: 1 1 auto;
  min-width: 0;
  padding: 9px 0;
  border: none;
  background: transparent;
  color: var(--text);
  font-family: var(--font-mono);
  font-size: var(--text-sm);
}

.key-field__input:focus {
  outline: none;
}

.key-field__eye {
  display: inline-flex;
  flex: none;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  border-radius: var(--radius-xs);
  color: var(--text-muted);
}

.key-field__eye:hover {
  background: var(--surface-hover);
  color: var(--text);
}
</style>
