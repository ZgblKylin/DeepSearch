<script setup lang="ts">
import { ref } from 'vue'

import Icon from '@/components/ui/Icon.vue'
import { useQueryRoute } from '@/composables/useQueryRoute'
import { clearSearchHistory } from '@/lib/searchHistory'
import { useSettings } from '@/stores/settings'
import { useUi } from '@/stores/ui'
import { useUsage } from '@/stores/usage'

/**
 * 设置面板 · 危险操作（PLAN 3.6）：
 * - 清空数据使用危险色 + 二次确认；
 * - 清空 API Key、全部设置、搜索历史与本机统计；
 * - 主题恢复为跟随系统，并返回首页。
 */
const { resetAll } = useSettings()
const { clearAll } = useUsage()
const { closeSettings, showToast } = useUi()
const { goHome } = useQueryRoute()

const confirming = ref(false)

function clearEverything(): void {
  resetAll()
  clearAll()
  clearSearchHistory()
  confirming.value = false
  closeSettings()
  goHome()
  showToast('已清空本机数据', 'success')
}
</script>

<template>
  <section class="settings-section settings-section--danger" aria-labelledby="settings-danger-title">
    <div class="settings-section__head">
      <h3 id="settings-danger-title" class="settings-section__title">危险操作</h3>
    </div>
    <p class="settings-section__desc">
      清空本机保存的 API Key、全部设置、搜索历史与统计数据，操作不可撤销。
    </p>

    <div v-if="!confirming" class="settings-inline">
      <button type="button" class="btn btn--danger btn--sm" @click="confirming = true">
        <Icon name="trash" :size="14" />
        清空数据
      </button>
    </div>
    <div v-else class="settings-confirm" role="alertdialog" aria-labelledby="settings-danger-confirm-title">
      <strong id="settings-danger-confirm-title" class="settings-confirm__title">
        确定清空全部本机数据？
      </strong>
      <ul class="danger-list">
        <li>API Key 与全部设置项</li>
        <li>搜索 / 抓取 / Token / 费用统计</li>
        <li>主题恢复为跟随系统，并返回首页</li>
      </ul>
      <div class="settings-confirm__actions">
        <button type="button" class="btn btn--ghost btn--sm" @click="confirming = false">
          取消
        </button>
        <button type="button" class="btn btn--danger btn--sm" @click="clearEverything">
          确认清空
        </button>
      </div>
    </div>
  </section>
</template>

<style scoped>
.danger-list {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding-left: 18px;
  color: var(--text-secondary);
  font-size: var(--text-xs);
  list-style: disc;
}

.settings-confirm__title {
  color: var(--danger);
  font-size: var(--text-sm);
}
</style>
