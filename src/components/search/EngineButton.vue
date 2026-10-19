<script setup lang="ts">
import { computed } from 'vue'

import { buildEngineSearchUrl, getEngine } from '@/lib/engines'
import { useSettings } from '@/stores/settings'

/**
 * 外部搜索引擎按钮（PLAN 3.2）：只显示 logo，点击在新标签页打开当前查询。
 * 空查询时禁用；`noopener noreferrer` 防止新标签页拿到 opener。
 */
const props = withDefaults(defineProps<{ query?: string }>(), { query: '' })

const { settings } = useSettings()
const engine = computed(() => getEngine(settings.engine))
const trimmedQuery = computed(() => props.query.trim())
const canSearch = computed(() => trimmedQuery.value.length > 0)
const href = computed(() => buildEngineSearchUrl(settings.engine, trimmedQuery.value))
const label = computed(() => `用 ${engine.value.name} 搜索`)
</script>

<template>
  <a
    v-if="canSearch"
    class="engine-button"
    :href="href"
    target="_blank"
    rel="noopener noreferrer"
    :aria-label="label"
    :title="label"
    :data-engine="engine.id"
  >
    <svg
      class="engine-button__logo"
      viewBox="0 0 24 24"
      aria-hidden="true"
      v-html="engine.logo"
    />
  </a>

  <button
    v-else
    type="button"
    class="engine-button engine-button--disabled"
    disabled
    :aria-label="`${label}（当前无查询）`"
    :title="label"
    :data-engine="engine.id"
  >
    <svg
      class="engine-button__logo"
      viewBox="0 0 24 24"
      aria-hidden="true"
      v-html="engine.logo"
    />
  </button>
</template>

<style scoped>
.engine-button {
  display: inline-flex;
  flex: none;
  align-items: center;
  justify-content: center;
  width: 38px;
  height: 38px;
  border: 1px solid var(--border);
  border-radius: 50%;
  background: var(--surface);
  box-shadow: var(--shadow-sm);
  transition:
    border-color var(--transition-fast),
    background-color var(--transition-fast),
    transform var(--transition-fast);
}

.engine-button:hover {
  border-color: var(--border-strong);
  background: var(--surface-hover);
  text-decoration: none;
}

.engine-button:active {
  transform: scale(0.96);
}

.engine-button--disabled {
  cursor: not-allowed;
  opacity: 0.45;
}

.engine-button__logo {
  width: 20px;
  height: 20px;
}

@media (max-width: 480px) {
  .engine-button {
    width: 34px;
    height: 34px;
  }

  .engine-button__logo {
    width: 18px;
    height: 18px;
  }
}
</style>
