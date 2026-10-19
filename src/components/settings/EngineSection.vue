<script setup lang="ts">
import Icon from '@/components/ui/Icon.vue'
import { ENGINE_LIST } from '@/lib/engines'
import { useSettings } from '@/stores/settings'
import type { EngineId } from '@/types'

/**
 * 设置面板 · 外部搜索引擎（PLAN 3.6）：
 * Bing / Google / 百度 / DuckDuckGo 卡片单选，默认 Bing，修改立即生效。
 *
 * 引擎名称、品牌色与 logo 来自 T2 的 `lib/engines.ts`（同一事实来源）；
 * 本组件只补充一句展示说明。
 */
const { settings, update } = useSettings()

const ENGINE_DESCRIPTIONS: Record<EngineId, string> = {
  bing: '微软搜索',
  google: '谷歌搜索',
  baidu: '中文搜索',
  duckduckgo: '注重隐私',
}
</script>

<template>
  <section class="settings-section" aria-labelledby="settings-engine-title">
    <div class="settings-section__head">
      <h3 id="settings-engine-title" class="settings-section__title">外部搜索引擎</h3>
    </div>

    <div class="engine-grid" role="group" aria-labelledby="settings-engine-title">
      <button
        v-for="engine in ENGINE_LIST"
        :key="engine.id"
        type="button"
        class="engine-card"
        :class="{ 'engine-card--active': settings.engine === engine.id }"
        :aria-pressed="settings.engine === engine.id"
        @click="update({ engine: engine.id })"
      >
        <span class="engine-card__logo" aria-hidden="true">
          <svg width="22" height="22" viewBox="0 0 24 24" focusable="false" v-html="engine.logo" />
        </span>
        <span class="engine-card__text">
          <span class="engine-card__name">{{ engine.name }}</span>
          <span class="engine-card__desc">{{ ENGINE_DESCRIPTIONS[engine.id] }}</span>
        </span>
        <Icon
          v-if="settings.engine === engine.id"
          name="check"
          :size="15"
          class="engine-card__check"
        />
      </button>
    </div>

    <p class="settings-hint">仅影响搜索框右侧的外部引擎跳转，修改立即生效。</p>
  </section>
</template>

<style scoped>
.engine-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--space-2);
}

.engine-card {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding: 9px 10px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--surface);
  text-align: left;
  transition:
    background-color var(--transition-fast),
    border-color var(--transition-fast),
    color var(--transition-fast);
}

.engine-card:hover {
  background: var(--surface-hover);
}

.engine-card--active {
  border-color: var(--brand);
  background: var(--brand-soft);
}

.engine-card__logo {
  display: inline-flex;
  flex: none;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  border-radius: var(--radius-xs);
  background: var(--bg-elevated);
}

.engine-card__text {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  min-width: 0;
}

.engine-card__name {
  overflow: hidden;
  color: var(--text);
  font-size: var(--text-sm);
  font-weight: 600;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.engine-card__desc {
  color: var(--text-muted);
  font-size: var(--text-xs);
}

.engine-card__check {
  flex: none;
  color: var(--brand);
}
</style>
