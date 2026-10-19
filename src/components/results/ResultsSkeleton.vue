<script setup lang="ts">
import LoadingDots from '@/components/ui/LoadingDots.vue'

/**
 * 加载骨架（PLAN 3.3）：骨架卡片 + “正在搜索 ···”三点动画。
 * 纯装饰，读屏由 ResultsHeader 的 aria-live 状态承担。
 */
const CARD_COUNT = 5
</script>

<template>
  <div class="results-skeleton">
    <p class="results-skeleton__status">
      <LoadingDots label="正在搜索" />
      <span>正在搜索 ···</span>
    </p>

    <div v-for="index in CARD_COUNT" :key="index" class="skeleton-card" aria-hidden="true">
      <div class="skeleton-card__meta">
        <span class="skeleton skeleton--avatar" />
        <span class="skeleton skeleton--line skeleton--w-30" />
        <span class="skeleton skeleton--line skeleton--w-15" />
      </div>
      <span class="skeleton skeleton--title" />
      <span class="skeleton skeleton--line skeleton--w-90" />
      <span class="skeleton skeleton--line skeleton--w-70" />
    </div>
  </div>
</template>

<style scoped>
.results-skeleton {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

.results-skeleton__status {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  color: var(--text-muted);
  font-size: var(--text-sm);
}

.skeleton-card {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  padding: var(--space-4);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  background: var(--surface);
}

.skeleton-card__meta {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  margin-bottom: var(--space-1);
}

.skeleton {
  display: block;
  border-radius: var(--radius-xs);
  background: linear-gradient(
    90deg,
    var(--bg-inset) 25%,
    var(--surface-hover) 37%,
    var(--bg-inset) 63%
  );
  background-size: 400% 100%;
  animation: skeleton-shimmer 1.4s ease infinite;
}

.skeleton--avatar {
  width: 22px;
  height: 22px;
  border-radius: var(--radius-xs);
}

.skeleton--line {
  height: 12px;
}

.skeleton--title {
  width: 62%;
  height: 18px;
}

.skeleton--w-15 {
  width: 15%;
  min-width: 56px;
}

.skeleton--w-30 {
  width: 30%;
  min-width: 86px;
}

.skeleton--w-70 {
  width: 70%;
}

.skeleton--w-90 {
  width: 90%;
}

@keyframes skeleton-shimmer {
  0% {
    background-position: 100% 50%;
  }

  100% {
    background-position: 0 50%;
  }
}

@media (prefers-reduced-motion: reduce) {
  .skeleton {
    animation: none;
  }
}
</style>
