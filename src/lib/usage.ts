/**
 * 本机用量统计的纯函数层。
 *
 * 职责：
 * - 校验 / 归一化 localStorage 中的统计对象（损坏数据静默回退）；
 * - 提供不可变 reducer：`addSearch` / `addFetch` / `addChat`，不修改入参；
 * - 提供聚合读取：token 总数、费用总数、模型维度行。
 *
 * 口径（PLAN 第 5 节）：
 * - `searches` / `fetches` 只统计成功请求，失败不计入；
 * - `searchBillable` / `fetchBillable` 只统计成功且返回非空（可计费）的请求；
 * - Chat 费用按请求完成时刻的北京时间判定峰谷，分别累计到 `peakCost` / `offPeakCost`；
 * - `reasoningTokens` 是输出 tokens 的子集，不计入 token 总数（总数 = 命中 + 未命中 + 输出）。
 */

import type { ChatUsage, ModelUsage, UsageStats } from '@/types'
import {
  PRICING_MODEL_ORDER,
  calculateChatCostByTier,
  calculateFetchCost,
  calculateSearchCost,
  getModelLabel,
  normalizeModelName,
  resolvePriceTier,
} from '@/lib/pricing'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** 非负有限数；非法值回退 fallback */
function readNonNegative(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
    ? value
    : fallback
}

/** 非负整数计数（四舍五入后不小于 0） */
function readCount(value: unknown, fallback = 0): number {
  const number = readNonNegative(value, fallback)
  return Math.floor(number)
}

/** 空模型用量 */
export function createModelUsage(): ModelUsage {
  return {
    promptHitTokens: 0,
    promptMissTokens: 0,
    completionTokens: 0,
    reasoningTokens: 0,
    requests: 0,
    peakCost: 0,
    offPeakCost: 0,
  }
}

/** 空统计对象 */
export function createEmptyUsage(): UsageStats {
  return {
    searches: 0,
    searchBillable: 0,
    searchCost: 0,
    fetches: 0,
    fetchBillable: 0,
    fetchCost: 0,
    models: {},
    updatedAt: 0,
  }
}

function normalizeModelUsage(input: unknown): ModelUsage {
  const source = isRecord(input) ? input : {}
  return {
    promptHitTokens: readCount(source.promptHitTokens),
    promptMissTokens: readCount(source.promptMissTokens),
    completionTokens: readCount(source.completionTokens),
    reasoningTokens: readCount(source.reasoningTokens),
    requests: readCount(source.requests),
    peakCost: readNonNegative(source.peakCost),
    offPeakCost: readNonNegative(source.offPeakCost),
  }
}

function mergeModelUsage(target: ModelUsage, source: ModelUsage): void {
  target.promptHitTokens += source.promptHitTokens
  target.promptMissTokens += source.promptMissTokens
  target.completionTokens += source.completionTokens
  target.reasoningTokens += source.reasoningTokens
  target.requests += source.requests
  target.peakCost += source.peakCost
  target.offPeakCost += source.offPeakCost
}

/**
 * 校验并归一化统计对象：非法字段回退 0，模型名归一化（别名合并）。
 * 公开导出便于 store 与单元测试使用。
 */
export function normalizeUsage(input: unknown): UsageStats {
  const source = isRecord(input) ? input : {}
  const empty = createEmptyUsage()

  const models: Record<string, ModelUsage> = {}
  if (isRecord(source.models)) {
    for (const [rawModel, rawUsage] of Object.entries(source.models)) {
      const model = normalizeModelName(rawModel)
      const normalized = normalizeModelUsage(rawUsage)
      const existing = models[model]
      if (existing) mergeModelUsage(existing, normalized)
      else models[model] = normalized
    }
  }

  return {
    searches: readCount(source.searches),
    searchBillable: readCount(source.searchBillable),
    searchCost: readNonNegative(source.searchCost),
    fetches: readCount(source.fetches),
    fetchBillable: readCount(source.fetchBillable),
    fetchCost: readNonNegative(source.fetchCost),
    models,
    updatedAt: readNonNegative(source.updatedAt, empty.updatedAt),
  }
}

function normalizeTimestamp(now: number | undefined): number {
  return typeof now === 'number' && Number.isFinite(now) && now >= 0 ? now : Date.now()
}

/**
 * 记录一次搜索成功（失败不应调用）：`searches` 必加一；
 * 结果非空时额外累计 `searchBillable` 与费用。
 */
export function addSearch(
  usage: UsageStats,
  resultCount: number,
  now?: number,
): UsageStats {
  const count = readCount(resultCount)
  const billable = count > 0 ? 1 : 0
  return {
    ...usage,
    searches: usage.searches + 1,
    searchBillable: usage.searchBillable + billable,
    searchCost: usage.searchCost + calculateSearchCost(billable),
    updatedAt: normalizeTimestamp(now),
  }
}

/**
 * 记录一次网页抓取。
 *
 * `success` 表示“成功且正文非空”（可计费）——失败或空正文不记录、不计费。
 * 返回原对象表示无变化（便于调用方跳过持久化）。
 */
export function addFetch(
  usage: UsageStats,
  success: boolean,
  now?: number,
): UsageStats {
  if (!success) return usage
  return {
    ...usage,
    fetches: usage.fetches + 1,
    fetchBillable: usage.fetchBillable + 1,
    fetchCost: usage.fetchCost + calculateFetchCost(1),
    updatedAt: normalizeTimestamp(now),
  }
}

function safeTokens(value: number): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : 0
}

/**
 * 记录一次成功的 Chat 请求：按 `at`（默认当前时间）的北京时间判定峰谷，
 * 累计 token、请求数与对应档位的费用。
 */
export function addChat(
  usage: UsageStats,
  model: string,
  chatUsage: ChatUsage,
  at?: Date | number,
): UsageStats {
  const canonicalModel = normalizeModelName(model)
  const tier = resolvePriceTier(at)
  const hitTokens = safeTokens(chatUsage.promptCacheHitTokens)
  const missTokens = safeTokens(chatUsage.promptCacheMissTokens)
  const completionTokens = safeTokens(chatUsage.completionTokens)
  const reasoningTokens = safeTokens(chatUsage.reasoningTokens)

  const previous = usage.models[canonicalModel] ?? createModelUsage()
  const requestCost = calculateChatCostByTier(canonicalModel, chatUsage, tier).totalCost

  const nextModel: ModelUsage = {
    promptHitTokens: previous.promptHitTokens + hitTokens,
    promptMissTokens: previous.promptMissTokens + missTokens,
    completionTokens: previous.completionTokens + completionTokens,
    reasoningTokens: previous.reasoningTokens + reasoningTokens,
    requests: previous.requests + 1,
    peakCost: previous.peakCost + (tier === 'peak' ? requestCost : 0),
    offPeakCost: previous.offPeakCost + (tier === 'offPeak' ? requestCost : 0),
  }

  return {
    ...usage,
    models: { ...usage.models, [canonicalModel]: nextModel },
    updatedAt: normalizeTimestamp(undefined),
  }
}

/** 单个模型的 token 总数（命中 + 未命中 + 输出） */
export function modelTotalTokens(model: ModelUsage): number {
  return model.promptHitTokens + model.promptMissTokens + model.completionTokens
}

/** 单个模型的总费用（高峰 + 空闲） */
export function modelTotalCost(model: ModelUsage): number {
  return model.peakCost + model.offPeakCost
}

/** 全部模型的 token 总数 */
export function totalTokens(usage: UsageStats): number {
  return Object.values(usage.models).reduce(
    (sum, model) => sum + modelTotalTokens(model),
    0,
  )
}

/** 预估 API 总费用：Search + Fetch + 全部模型 Chat 费用 */
export function totalCost(usage: UsageStats): number {
  const chatCost = Object.values(usage.models).reduce(
    (sum, model) => sum + modelTotalCost(model),
    0,
  )
  return usage.searchCost + usage.fetchCost + chatCost
}

/** 统计表的一行（模型维度） */
export interface UsageModelRow {
  /** 归一化后的模型名 */
  model: string
  /** 界面展示名 */
  label: string
  /** 原始累计值（响应式读取） */
  usage: ModelUsage
  totalTokens: number
  totalCost: number
}

/** 按固定顺序输出有记录的模型行（Flash → Pro → 其他按名称排序） */
export function usageModelRows(usage: UsageStats): UsageModelRow[] {
  const rows: UsageModelRow[] = []
  const seen = new Set<string>()

  const pushRow = (model: string): void => {
    const data = usage.models[model]
    if (!data) return
    rows.push({
      model,
      label: getModelLabel(model),
      usage: data,
      totalTokens: modelTotalTokens(data),
      totalCost: modelTotalCost(data),
    })
  }

  for (const model of PRICING_MODEL_ORDER) {
    pushRow(model)
    seen.add(model)
  }
  for (const model of Object.keys(usage.models).sort()) {
    if (seen.has(model)) continue
    pushRow(model)
  }
  return rows
}
