<script setup lang="ts">
/** 页脚声明（PLAN 3.8）：正常文档流，不固定。 */
</script>

<template>
  <footer class="footer">
    <div class="container footer__inner">
      <p class="footer__line">无广告 · 无追踪 · 非 DeepSeek 官方 · API Key 仅保存在浏览器本地</p>
      <p class="footer__line footer__line--muted">
        搜索与 AI 内容由 DeepSeek API 提供，仅供参考。
      </p>
    </div>
  </footer>
</template>

<style scoped>
.footer {
  flex: none;
  margin-top: var(--space-12);
  border-top: 1px solid var(--border);
  background: var(--bg-subtle);
}

.footer__inner {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding-block: var(--space-6);
  text-align: center;
}

.footer__line {
  color: var(--text-secondary);
  font-size: var(--text-xs);
  line-height: 1.8;
}

.footer__line--muted {
  color: var(--text-muted);
}
</style>
