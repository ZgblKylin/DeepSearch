<script setup lang="ts">
import { computed, ref } from 'vue'

import SearchBar from '@/components/search/SearchBar.vue'
import Icon from '@/components/ui/Icon.vue'
import Popover from '@/components/ui/Popover.vue'
import WhaleLogo from '@/components/ui/WhaleLogo.vue'
import { useQueryRoute } from '@/composables/useQueryRoute'
import { useTheme } from '@/composables/useTheme'
import { useUi } from '@/stores/ui'
import type { ThemeMode } from '@/types'

const REPO_URL = 'https://github.com/ZgblKylin/DeepSearch'

const { query, goHome } = useQueryRoute()
const { theme, setTheme } = useTheme()
const { openSettings } = useUi()

/** 结果页在顶栏中央显示紧凑搜索框；首页只保留 hero 搜索框 */
const showSearch = computed(() => query.value.trim().length > 0)

const themeOpen = ref(false)

const themeOptions: ReadonlyArray<{ value: ThemeMode; label: string; icon: string }> = [
  { value: 'light', label: '浅色', icon: 'sun' },
  { value: 'dark', label: '深色', icon: 'moon' },
  { value: 'system', label: '跟随系统', icon: 'monitor' },
]

const themeIcon = computed(() => {
  if (theme.value === 'light') return 'sun'
  if (theme.value === 'dark') return 'moon'
  return 'monitor'
})

const themeButtonLabel = computed(() => {
  const current = themeOptions.find((option) => option.value === theme.value)
  return `主题：${current?.label ?? '跟随系统'}`
})

function chooseTheme(value: ThemeMode): void {
  setTheme(value)
  themeOpen.value = false
}
</script>

<template>
  <header class="topbar" :class="{ 'topbar--with-search': showSearch }">
    <div class="topbar__inner container">
      <a class="topbar__brand" href="./" aria-label="DeepSearch 首页" @click.prevent="goHome">
        <WhaleLogo :size="26" title="DeepSearch" />
        <span class="topbar__name">DeepSearch</span>
      </a>

      <div v-if="showSearch" class="topbar__search">
        <SearchBar compact />
      </div>

      <nav class="topbar__actions" aria-label="站点操作">
        <Popover
          v-model:open="themeOpen"
          align="end"
          role="menu"
          panel-class="topbar__theme-menu"
        >
          <template #trigger="{ open, toggle }">
            <button
              type="button"
              class="icon-btn"
              :aria-label="themeButtonLabel"
              aria-haspopup="menu"
              :aria-expanded="open"
              title="主题"
              @click="toggle"
            >
              <Icon :name="themeIcon" :size="19" />
            </button>
          </template>

          <div class="theme-menu">
            <button
              v-for="option in themeOptions"
              :key="option.value"
              type="button"
              class="theme-menu__item"
              role="menuitemradio"
              :aria-checked="theme === option.value"
              @click="chooseTheme(option.value)"
            >
              <Icon :name="option.icon" :size="16" />
              <span class="theme-menu__label">{{ option.label }}</span>
              <Icon v-if="theme === option.value" name="check" :size="15" class="theme-menu__check" />
            </button>
          </div>
        </Popover>

        <a
          class="icon-btn"
          :href="REPO_URL"
          target="_blank"
          rel="noopener noreferrer"
          aria-label="GitHub 仓库"
          title="GitHub"
        >
          <Icon name="github" :size="19" />
        </a>

        <button type="button" class="icon-btn" aria-label="设置" title="设置" @click="openSettings">
          <Icon name="settings" :size="19" />
        </button>
      </nav>
    </div>
  </header>
</template>

<style scoped>
/*
 * 固定顶栏（PLAN 3.2）：sticky + top: 0，页面滚动时始终停在视口顶部，
 * 同时保留在文档流中的占位，避免内容被遮挡、无需额外 padding。
 */
.topbar {
  position: sticky;
  top: 0;
  z-index: var(--z-topbar);
  border-bottom: 1px solid var(--border);
  background: var(--bg);
  background: color-mix(in srgb, var(--bg) 88%, transparent);
  backdrop-filter: blur(12px);
}

.topbar__inner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-4);
  min-height: var(--topbar-height);
}

.topbar__brand {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  color: var(--text);
  font-size: var(--text-lg);
  font-weight: 700;
  letter-spacing: -0.01em;
}

.topbar__brand:hover {
  text-decoration: none;
}

.topbar__name {
  white-space: nowrap;
}

.topbar__actions {
  display: flex;
  align-items: center;
  gap: var(--space-1);
}

/* 结果页：桌面三列（品牌 / 居中搜索 / 操作）。
 * 左右两列等宽（同为 1fr），保证中间搜索列始终位于视口几何中心（QA P3-1）。 */
.topbar--with-search .topbar__inner {
  display: grid;
  grid-template-columns:
    minmax(150px, 1fr)
    minmax(0, var(--hero-max))
    minmax(150px, 1fr);
  align-items: center;
  gap: var(--space-4);
  padding-block: var(--space-2);
}

.topbar--with-search .topbar__brand {
  justify-self: start;
}

.topbar--with-search .topbar__actions {
  justify-self: end;
}

.topbar__search {
  display: flex;
  justify-content: center;
  min-width: 0;
}

.theme-menu {
  display: flex;
  flex-direction: column;
  min-width: 152px;
}

.theme-menu__item {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  width: 100%;
  padding: 8px 10px;
  border-radius: var(--radius-sm);
  color: var(--text-secondary);
  font-size: var(--text-sm);
  text-align: left;
  transition:
    background-color var(--transition-fast),
    color var(--transition-fast);
}

.theme-menu__item:hover {
  background: var(--surface-hover);
  color: var(--text);
}

.theme-menu__item[aria-checked='true'] {
  color: var(--brand);
}

.theme-menu__label {
  flex: 1;
}

.theme-menu__check {
  color: var(--brand);
}

@media (max-width: 768px) {
  .topbar__name {
    font-size: var(--text-base);
  }

  /* 移动端结果页两行：品牌 + 操作，第二行整行搜索框 */
  .topbar--with-search .topbar__inner {
    grid-template-columns: minmax(0, 1fr) auto;
    grid-template-areas:
      'brand actions'
      'search search';
    row-gap: var(--space-2);
    padding-block: var(--space-2) var(--space-3);
  }

  .topbar--with-search .topbar__brand {
    grid-area: brand;
  }

  .topbar--with-search .topbar__actions {
    grid-area: actions;
  }

  .topbar--with-search .topbar__search {
    grid-area: search;
    width: 100%;
  }
}
</style>
