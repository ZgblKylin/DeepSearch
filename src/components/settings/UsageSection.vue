<script setup lang="ts">
import { computed, ref } from 'vue'

import Icon from '@/components/ui/Icon.vue'
import { formatCny, formatDateTime, formatNumber } from '@/lib/format'
import {
  MODEL_PRICING,
  PRICING_MODEL_ORDER,
  SEARCH_PRICE_PER_REQUEST,
} from '@/lib/pricing'
import { totalCost, totalTokens, usageModelRows } from '@/lib/usage'
import { useUsage } from '@/stores/usage'
import { useUi } from '@/stores/ui'

/**
 * 设置面板 · 本机数据统计（PLAN 3.6 / 第 5 节）：
 * - 总览：搜索次数、抓取次数、Token 总消耗、预估 API 花费；
 * - 模型维度：命中 / 未命中 / 输出 tokens、请求数、高峰 / 空闲费用；
 * - Search / Fetch 计费与价格说明；
 * - 清零用量需要二次确认，仅清统计，不动 Key 与设置。
 */
const { usage, resetUsage } = useUsage()
const { showToast } = useUi()

const confirming = ref(false)

const modelRows = computed(() => usageModelRows(usage))
const tokenTotal = computed(() => totalTokens(usage))
const estimatedCost = computed(() => totalCost(usage))
const requestCost = computed(() => usage.searchCost + usage.fetchCost)
const lastUpdated = computed(() =>
  usage.updatedAt > 0 ? formatDateTime(usage.updatedAt) : '',
)

const priceRows = PRICING_MODEL_ORDER.map((model) => {
  const pricing = MODEL_PRICING[model]
  const pair = (price: { peak: number; offPeak: number }): string =>
    `${price.peak} / ${price.offPeak}`
  return {
    model,
    label: pricing.label,
    hit: pair(pricing.promptHit),
    miss: pair(pricing.promptMiss),
    completion: pair(pricing.completion),
  }
})

function clearUsage(): void {
  resetUsage()
  confirming.value = false
  showToast('本机统计已清零', 'success')
}
</script>

<template>
  <section class="settings-section" aria-labelledby="settings-usage-title">
    <div class="settings-section__head">
      <h3 id="settings-usage-title" class="settings-section__title">本机数据统计</h3>
      <span v-if="lastUpdated" class="settings-hint">更新于 {{ lastUpdated }}</span>
    </div>
    <p class="settings-section__desc">
      仅保存在浏览器本地，用于估算 API 花费；只统计成功请求。
    </p>

    <div class="usage-overview">
      <div class="usage-card">
        <span class="usage-card__label">搜索次数</span>
        <span class="usage-card__value">{{ formatNumber(usage.searches) }}</span>
        <span class="usage-card__meta">计费 {{ formatNumber(usage.searchBillable) }} 次</span>
      </div>
      <div class="usage-card">
        <span class="usage-card__label">抓取次数</span>
        <span class="usage-card__value">{{ formatNumber(usage.fetches) }}</span>
        <span class="usage-card__meta">计费 {{ formatNumber(usage.fetchBillable) }} 次</span>
      </div>
      <div class="usage-card">
        <span class="usage-card__label">Token 总消耗</span>
        <span class="usage-card__value">{{ formatNumber(tokenTotal) }}</span>
        <span class="usage-card__meta">命中 + 未命中 + 输出</span>
      </div>
      <div class="usage-card usage-card--cost">
        <span class="usage-card__label">预估 API 花费</span>
        <span class="usage-card__value">{{ formatCny(estimatedCost) }}</span>
        <span class="usage-card__meta">Search + Fetch + Chat</span>
      </div>
    </div>

    <div class="settings-group">
      <span class="settings-label">模型用量与峰谷费用</span>
      <div class="usage-table-wrap">
        <table class="usage-table">
          <caption class="visually-hidden">
            按模型统计的 token、请求与费用
          </caption>
          <thead>
            <tr>
              <th scope="col">模型</th>
              <th scope="col">命中</th>
              <th scope="col">未命中</th>
              <th scope="col">输出</th>
              <th scope="col">请求</th>
              <th scope="col">高峰</th>
              <th scope="col">空闲</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in modelRows" :key="row.model">
              <th scope="row" class="usage-table__model">{{ row.label }}</th>
              <td>{{ formatNumber(row.usage.promptHitTokens) }}</td>
              <td>{{ formatNumber(row.usage.promptMissTokens) }}</td>
              <td>{{ formatNumber(row.usage.completionTokens) }}</td>
              <td>{{ formatNumber(row.usage.requests) }}</td>
              <td>{{ formatCny(row.usage.peakCost) }}</td>
              <td>{{ formatCny(row.usage.offPeakCost) }}</td>
            </tr>
            <tr v-if="modelRows.length === 0">
              <td colspan="7" class="usage-table__empty">暂无 AI 调用记录</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p class="settings-hint">
        输出 tokens 包含思考 tokens；高峰 / 空闲费用按每次请求完成时的北京时间分别累计。
      </p>
    </div>

    <div class="settings-group">
      <span class="settings-label">Search / Fetch 计费</span>
      <ul class="billing-list">
        <li class="billing-row">
          <span>Search 成功 {{ formatNumber(usage.searches) }} 次 · 计费 {{ formatNumber(usage.searchBillable) }} 次</span>
          <span class="billing-row__cost">{{ formatCny(usage.searchCost) }}</span>
        </li>
        <li class="billing-row">
          <span>Fetch 成功 {{ formatNumber(usage.fetches) }} 次 · 计费 {{ formatNumber(usage.fetchBillable) }} 次</span>
          <span class="billing-row__cost">{{ formatCny(usage.fetchCost) }}</span>
        </li>
        <li class="billing-row billing-row--total">
          <span>请求计费小计</span>
          <span class="billing-row__cost">{{ formatCny(requestCost) }}</span>
        </li>
      </ul>
      <p class="settings-hint">
        Search / Fetch 每 1000 次成功请求 ¥5（每次 ¥{{ SEARCH_PRICE_PER_REQUEST }}），失败或返回为空的请求不计费。
      </p>
    </div>

    <details class="price-note">
      <summary class="price-note__summary">价格说明</summary>
      <div class="price-note__body">
        <p>按 2026-10 官方价格硬编码，实际以平台账单为准。</p>
        <p>
          高峰时段：北京时间周一至周五 9:00–12:00、14:00–18:00；周六、周日及法定节假日全天按空闲价（节假日以工作日近似）。
        </p>
        <div class="usage-table-wrap">
          <table class="usage-table">
            <thead>
              <tr>
                <th scope="col">模型</th>
                <th scope="col">命中（峰 / 谷）</th>
                <th scope="col">未命中（峰 / 谷）</th>
                <th scope="col">输出（峰 / 谷）</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="row in priceRows" :key="row.model">
                <th scope="row" class="usage-table__model">{{ row.label }}</th>
                <td>{{ row.hit }}</td>
                <td>{{ row.miss }}</td>
                <td>{{ row.completion }}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p class="price-note__unit">单位：元 / 百万 tokens；模型别名 deepseek-v4-flash 按 Flash 计价。</p>
      </div>
    </details>

    <div v-if="!confirming" class="settings-inline">
      <button type="button" class="btn btn--outline btn--sm" @click="confirming = true">
        <Icon name="rotate-ccw" :size="14" />
        清零用量
      </button>
    </div>
    <div v-else class="settings-confirm settings-confirm--warning">
      <p class="settings-confirm__text">
        确定清零本机统计？搜索 / 抓取次数、Token 与费用记录将归零，API Key 与设置不受影响。
      </p>
      <div class="settings-confirm__actions">
        <button type="button" class="btn btn--ghost btn--sm" @click="confirming = false">
          取消
        </button>
        <button type="button" class="btn btn--primary btn--sm" @click="clearUsage">
          确认清零
        </button>
      </div>
    </div>
  </section>
</template>

<style scoped>
.usage-overview {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--space-2);
}

.usage-card {
  display: flex;
  flex-direction: column;
  gap: 1px;
  padding: var(--space-3);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  background: var(--bg-subtle);
}

.usage-card--cost {
  border-color: var(--brand-soft-strong);
  background: var(--brand-soft);
}

.usage-card__label {
  color: var(--text-muted);
  font-size: var(--text-xs);
}

.usage-card__value {
  color: var(--text);
  font-size: var(--text-lg);
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  line-height: 1.3;
}

.usage-card--cost .usage-card__value {
  color: var(--brand);
}

.usage-card__meta {
  color: var(--text-muted);
  font-size: var(--text-xs);
}

.usage-table-wrap {
  overflow-x: auto;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
}

.usage-table {
  width: 100%;
  border-collapse: collapse;
  font-size: var(--text-xs);
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

.usage-table th,
.usage-table td {
  padding: 7px 10px;
  border-bottom: 1px solid var(--border);
  text-align: right;
}

.usage-table thead th {
  background: var(--bg-subtle);
  color: var(--text-muted);
  font-weight: 600;
  text-align: right;
}

.usage-table thead th:first-child {
  text-align: left;
}

.usage-table tbody tr:last-child th,
.usage-table tbody tr:last-child td {
  border-bottom: none;
}

.usage-table__model {
  color: var(--text);
  font-weight: 600;
  text-align: left;
}

.usage-table__empty {
  color: var(--text-muted);
  text-align: center !important;
}

.billing-list {
  display: flex;
  flex-direction: column;
}

.billing-row {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: var(--space-3);
  padding: 6px 0;
  border-bottom: 1px dashed var(--border);
  color: var(--text-secondary);
  font-size: var(--text-xs);
}

.billing-row__cost {
  flex: none;
  color: var(--text);
  font-variant-numeric: tabular-nums;
}

.billing-row--total {
  border-bottom: none;
  color: var(--text);
  font-weight: 600;
}

.billing-row--total .billing-row__cost {
  font-weight: 700;
}

.price-note {
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--bg-subtle);
}

.price-note__summary {
  padding: 8px 12px;
  color: var(--text-secondary);
  font-size: var(--text-xs);
  font-weight: 600;
  cursor: pointer;
}

.price-note__body {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  padding: 0 12px 10px;
  color: var(--text-muted);
  font-size: var(--text-xs);
  line-height: 1.7;
}

.price-note__unit {
  color: var(--text-muted);
}

@media (max-width: 400px) {
  .usage-overview {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
