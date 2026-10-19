<script setup lang="ts">
import { computed, ref, watch } from 'vue'

import Icon from '@/components/ui/Icon.vue'
import LetterAvatar from '@/components/ui/LetterAvatar.vue'
import { useAi } from '@/composables/useAi'
import { formatDate, formatScore } from '@/lib/format'
import type { SearchResult } from '@/types'

/**
 * 单条搜索结果卡片（PLAN 3.3）：
 * 标题、域名、站点名、日期、snippet、相关度分数、优质/权威徽标。
 * 标题与 URL 均在新标签页打开；站点图标优先使用 API 返回的 `site_icon`，
 * 缺失、非法或加载失败时回退为本地字母头像。
 * 标题区域右上角提供“AI 追问”，点击后基于该网页重置并开始 AI 对话。
 */
const props = defineProps<{ result: SearchResult }>()

const { startFromResult } = useAi()

function askAi(): void {
  startFromResult(props.result)
}

/** 图标加载失败后本次结果内不再重试，直接回退字母头像 */
const iconFailed = ref(false)

watch(
  () => [props.result.url, props.result.site_icon],
  () => {
    iconFailed.value = false
  },
)

/** 只接受 http(s) 图标地址；空值、相对地址或非 http(s) 协议均回退 */
const siteIconUrl = computed(() => {
  if (iconFailed.value) return ''
  const raw = props.result.site_icon.trim()
  if (!raw) return ''
  try {
    const url = new URL(raw)
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : ''
  } catch {
    return ''
  }
})

function handleIconError(): void {
  iconFailed.value = true
}

/** 优质阈值（PLAN 3.5 标签口径一致） */
const TOP_SCORE_THRESHOLD = 1.5
/** 权威阈值 */
const AUTHORITY_THRESHOLD = 3

const host = computed(() => {
  try {
    return new URL(props.result.url).hostname.replace(/^www\./iu, '')
  } catch {
    return ''
  }
})

const siteName = computed(() => props.result.site_name.trim() || host.value)
const title = computed(() => props.result.title.trim() || props.result.url)
const snippet = computed(() => props.result.snippet.trim() || props.result.summary.trim())
const dateText = computed(() => formatDate(props.result.date))
const scoreText = computed(() => formatScore(props.result.rerank_score))
const displayUrl = computed(() => props.result.url.replace(/^https?:\/\//u, '').replace(/\/$/u, ''))
const isTop = computed(() => props.result.rerank_score >= TOP_SCORE_THRESHOLD)
const isAuthoritative = computed(
  () => props.result.authority !== null && props.result.authority >= AUTHORITY_THRESHOLD,
)
</script>

<template>
  <article class="result-card">
    <div class="result-card__meta">
      <img
        v-if="siteIconUrl"
        class="result-card__icon"
        :src="siteIconUrl"
        alt=""
        width="22"
        height="22"
        loading="lazy"
        decoding="async"
        referrerpolicy="no-referrer"
        @error="handleIconError"
      />
      <LetterAvatar v-else :name="result.site_name" :url="result.url" :size="22" />
      <span class="result-card__site">{{ siteName }}</span>
      <template v-if="host">
        <span class="result-card__dot" aria-hidden="true">·</span>
        <span class="result-card__host">{{ host }}</span>
      </template>
      <time v-if="dateText" class="result-card__date" :datetime="dateText">
        <Icon name="clock" :size="12" />
        {{ dateText }}
      </time>
      <span v-if="isTop" class="result-card__badge result-card__badge--top">
        <Icon name="star" :size="12" />
        优质
      </span>
      <span v-if="isAuthoritative" class="result-card__badge result-card__badge--authority">
        <Icon name="shield" :size="12" />
        权威
      </span>
      <span class="result-card__score" :title="`相关度分数 ${result.rerank_score}`">
        相关度 {{ scoreText }}
      </span>
      <button
        type="button"
        class="result-card__ai"
        title="基于此网页进行 AI 追问"
        @click="askAi"
      >
        <Icon name="sparkles" :size="12" />
        <span>AI 追问</span>
      </button>
    </div>

    <h3 class="result-card__title">
      <a :href="result.url" target="_blank" rel="noopener noreferrer">{{ title }}</a>
    </h3>

    <p v-if="snippet" class="result-card__snippet">{{ snippet }}</p>

    <a
      class="result-card__url"
      :href="result.url"
      target="_blank"
      rel="noopener noreferrer"
      :title="result.url"
    >
      {{ displayUrl }}
    </a>
  </article>
</template>

<style scoped>
.result-card {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  padding: var(--space-4);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  background: var(--surface);
  transition:
    border-color var(--transition-fast),
    box-shadow var(--transition-fast);
}

.result-card:hover {
  border-color: var(--border-strong);
  box-shadow: var(--shadow-sm);
}

.result-card__meta {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  color: var(--text-muted);
  font-size: var(--text-xs);
}

.result-card__site {
  max-width: 200px;
  overflow: hidden;
  color: var(--text-secondary);
  font-weight: 600;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.result-card__icon {
  flex: none;
  width: 22px;
  height: 22px;
  border-radius: var(--radius-xs);
  background: var(--bg-inset);
  object-fit: contain;
}

.result-card__host {
  max-width: 220px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.result-card__dot {
  color: var(--border-strong);
}

.result-card__date {
  display: inline-flex;
  align-items: center;
  gap: 3px;
}

.result-card__badge {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  padding: 1px 7px;
  border-radius: var(--radius-pill);
  font-weight: 600;
  line-height: 1.6;
}

.result-card__badge--top {
  background: var(--brand-soft);
  color: var(--brand);
}

.result-card__badge--authority {
  background: var(--success-soft);
  color: var(--success);
}

.result-card__score {
  margin-left: auto;
  padding: 1px 8px;
  border-radius: var(--radius-pill);
  background: var(--bg-inset);
  color: var(--text-muted);
  font-family: var(--font-mono);
  white-space: nowrap;
}

.result-card__ai {
  display: inline-flex;
  flex: 0 0 auto;
  align-items: center;
  gap: 4px;
  padding: 1px 8px;
  border: 1px solid var(--border);
  border-radius: var(--radius-pill);
  background: var(--surface);
  color: var(--brand);
  font-size: var(--text-xs);
  font-weight: 600;
  line-height: 1.6;
  white-space: nowrap;
  transition:
    background-color var(--transition-fast),
    border-color var(--transition-fast);
}

.result-card__ai:hover {
  border-color: var(--brand);
  background: var(--brand-soft);
}

.result-card__title {
  font-size: var(--text-lg);
  font-weight: 600;
  line-height: 1.45;
  overflow-wrap: anywhere;
}

.result-card__title a {
  color: var(--text);
}

.result-card__title a:hover {
  color: var(--brand);
}

.result-card__snippet {
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 3;
  overflow: hidden;
  color: var(--text-secondary);
  font-size: var(--text-sm);
  line-height: 1.7;
  overflow-wrap: anywhere;
}

.result-card__url {
  align-self: flex-start;
  max-width: 100%;
  overflow: hidden;
  color: var(--text-muted);
  font-size: var(--text-xs);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.result-card__url:hover {
  color: var(--brand);
}

@media (max-width: 480px) {
  .result-card__score {
    margin-left: 0;
  }
}
</style>
