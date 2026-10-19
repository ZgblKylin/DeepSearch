<script setup lang="ts">
import SearchBar from '@/components/search/SearchBar.vue'
import WhaleLogo from '@/components/ui/WhaleLogo.vue'
</script>

<template>
  <section class="home">
    <div class="home__hero">
      <div class="home__brand">
        <WhaleLogo :size="56" title="DeepSearch" />
        <h1 class="home__title">DeepSearch</h1>
      </div>
      <p class="home__tagline">用 DeepSeek 搜索，让 AI 帮你读懂结果。</p>
      <div class="home__search">
        <SearchBar />
      </div>
      <p class="home__hint">支持站点、语言、日期等搜索语法 · 按需生成 AI 摘要</p>
    </div>
  </section>
</template>

<style scoped>
.home {
  display: flex;
  justify-content: center;
  padding: clamp(64px, 14vh, 160px) var(--space-4) var(--space-16);
}

.home__hero {
  display: flex;
  flex-direction: column;
  align-items: center;
  width: 100%;
  max-width: var(--hero-max);
  text-align: center;
}

.home__brand {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  margin-bottom: var(--space-4);
}

.home__title {
  font-size: clamp(30px, 6vw, 44px);
  font-weight: 800;
  letter-spacing: -0.02em;
  line-height: 1.1;
}

.home__tagline {
  margin-bottom: var(--space-8);
  color: var(--text-secondary);
  font-size: var(--text-lg);
}

.home__search {
  width: 100%;
}

.home__hint {
  margin-top: var(--space-5);
  color: var(--text-muted);
  font-size: var(--text-xs);
}

@media (max-width: 768px) {
  .home {
    padding-top: var(--space-12);
  }

  .home__tagline {
    font-size: var(--text-base);
  }
}
</style>
