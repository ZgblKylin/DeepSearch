/**
 * DeepSeek 价格与峰谷时段判定（纯函数，无副作用）。
 *
 * 价格口径（PLAN 第 5 节）：
 * - 单位：元 / 百万 tokens；
 * - 模型：deepseek-flash、deepseek-v4-pro；历史别名 deepseek-v4-flash 归一化为 Flash；
 * - Search / Fetch 每 1000 次成功请求 5 元（即每次 0.005 元）；
 * - 高峰：Asia/Shanghai 周一至周五 [9:00, 12:00) 与 [14:00, 18:00)；
 *   忽略法定节假日（按工作日近似），周六、周日全天低谷。
 */

import type { AiModel, ChatUsage } from '@/types'

/** 计费时段 */
export type PriceTier = 'peak' | 'offPeak'

/** 高峰 / 低谷双价 */
export interface TieredPrice {
  /** 高峰价（元 / 百万 tokens） */
  peak: number
  /** 空闲价（元 / 百万 tokens） */
  offPeak: number
}

/** 单个模型的价格定义 */
export interface ModelPricing {
  model: AiModel
  /** 界面展示名 */
  label: string
  /** 命中缓存的输入 tokens 价格 */
  promptHit: TieredPrice
  /** 未命中缓存的输入 tokens 价格 */
  promptMiss: TieredPrice
  /** 输出 tokens 价格 */
  completion: TieredPrice
}

/** 模型价格表（元 / 百万 tokens，高峰 / 空闲） */
export const MODEL_PRICING: Record<AiModel, ModelPricing> = {
  'deepseek-flash': {
    model: 'deepseek-flash',
    label: 'DeepSeek Flash',
    promptHit: { peak: 0.04, offPeak: 0.02 },
    promptMiss: { peak: 2, offPeak: 1 },
    completion: { peak: 8, offPeak: 4 },
  },
  'deepseek-v4-pro': {
    model: 'deepseek-v4-pro',
    label: 'DeepSeek V4 Pro',
    promptHit: { peak: 0.3, offPeak: 0.15 },
    promptMiss: { peak: 9, offPeak: 4.5 },
    completion: { peak: 27, offPeak: 13.5 },
  },
}

/** 历史 / 价格别名 → 正式模型名 */
export const MODEL_ALIASES: Record<string, AiModel> = {
  'deepseek-v4-flash': 'deepseek-flash',
}

/** 未知模型名的兜底模型（价格按 Flash 近似） */
export const FALLBACK_MODEL: AiModel = 'deepseek-flash'

/** 模型价格表中的模型顺序（用于统计表等展示） */
export const PRICING_MODEL_ORDER: readonly AiModel[] = [
  'deepseek-flash',
  'deepseek-v4-pro',
]

/** Search 每次成功请求价格（元） */
export const SEARCH_PRICE_PER_REQUEST = 0.005
/** Fetch 每次成功请求价格（元） */
export const FETCH_PRICE_PER_REQUEST = 0.005
/** 计费阶梯：每 1000 次成功请求 5 元（与 0.005 元/次等价） */
export const BILLABLE_UNIT_SIZE = 1000
export const BILLABLE_UNIT_PRICE = 5

/** 峰谷时段判定使用的时区 */
export const PEAK_TIME_ZONE = 'Asia/Shanghai'
/** 高峰小时区间（左闭右开，本地时间） */
export const PEAK_HOUR_RANGES: ReadonlyArray<readonly [number, number]> = [
  [9, 12],
  [14, 18],
]

const SHANGHAI_UTC_OFFSET_MS = 8 * 60 * 60 * 1000
const WEEKDAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const

/**
 * 归一化模型名：
 * - 历史别名 deepseek-v4-flash → deepseek-flash；
 * - 合法模型名原样返回；
 * - 未知 / 空值回退 Flash（避免账单统计崩溃）。
 */
export function normalizeModelName(model: string | null | undefined): AiModel {
  if (typeof model !== 'string') return FALLBACK_MODEL
  const raw = model.trim()
  const normalized = MODEL_ALIASES[raw] ?? raw
  return normalized === 'deepseek-v4-pro' ? 'deepseek-v4-pro' : FALLBACK_MODEL
}

/** 取模型价格定义（别名与未知名已归一化） */
export function getModelPricing(model: string | null | undefined): ModelPricing {
  return MODEL_PRICING[normalizeModelName(model)]
}

/** 模型展示名（未知模型按 Flash 展示） */
export function getModelLabel(model: string | null | undefined): string {
  return getModelPricing(model).label
}

interface ShanghaiTimeParts {
  /** 0 = 周日，1 = 周一 … 6 = 周六 */
  weekday: number
  /** 0–23 */
  hour: number
  minute: number
}

let cachedFormatter: Intl.DateTimeFormat | null | undefined

function getShanghaiFormatter(): Intl.DateTimeFormat | null {
  if (cachedFormatter !== undefined) return cachedFormatter
  try {
    cachedFormatter = new Intl.DateTimeFormat('en-US', {
      timeZone: PEAK_TIME_ZONE,
      hourCycle: 'h23',
      weekday: 'short',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    // 极少数运行环境不支持 IANA 时区：退回固定 UTC+8 换算
    cachedFormatter = null
  }
  return cachedFormatter
}

/**
 * 读取北京时间（Asia/Shanghai）的星期与时分。
 * 优先用 Intl 时区换算；不可用时按固定 UTC+8（中国无夏令时，结果一致）。
 */
function readShanghaiParts(date: Date): ShanghaiTimeParts {
  const formatter = getShanghaiFormatter()
  if (formatter) {
    try {
      const values: Record<string, string> = {}
      for (const part of formatter.formatToParts(date)) {
        values[part.type] = part.value
      }
      const weekday = WEEKDAY_NAMES.indexOf(
        (values.weekday ?? '') as (typeof WEEKDAY_NAMES)[number],
      )
      const hour = Number.parseInt(values.hour ?? '', 10)
      const minute = Number.parseInt(values.minute ?? '', 10)
      if (weekday >= 0 && Number.isFinite(hour) && Number.isFinite(minute)) {
        return { weekday, hour, minute }
      }
    } catch {
      // 落到固定时区换算
    }
  }
  const shifted = new Date(date.getTime() + SHANGHAI_UTC_OFFSET_MS)
  return {
    weekday: shifted.getUTCDay(),
    hour: shifted.getUTCHours(),
    minute: shifted.getUTCMinutes(),
  }
}

function toDate(at?: Date | number): Date {
  if (at === undefined) return new Date()
  return at instanceof Date ? at : new Date(at)
}

/**
 * 是否处于高峰时段（北京时间周一至周五 9:00–12:00、14:00–18:00）。
 * 边界：9:00 与 14:00 计入高峰；12:00 与 18:00 起为低谷。
 */
export function isPeakTime(at?: Date | number): boolean {
  const date = toDate(at)
  if (Number.isNaN(date.getTime())) return false
  const { weekday, hour } = readShanghaiParts(date)
  if (weekday === 0 || weekday === 6) return false
  return PEAK_HOUR_RANGES.some(([start, end]) => hour >= start && hour < end)
}

/** 当前时段的计费档位 */
export function resolvePriceTier(at?: Date | number): PriceTier {
  return isPeakTime(at) ? 'peak' : 'offPeak'
}

/** Chat 费用明细（元） */
export interface ChatCostBreakdown {
  /** 归一化后的模型名 */
  model: AiModel
  label: string
  tier: PriceTier
  promptHitCost: number
  promptMissCost: number
  completionCost: number
  /** 本次请求总费用（元） */
  totalCost: number
}

function safeTokens(value: number): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : 0
}

/**
 * 按指定档位计算一次 Chat 请求的费用（不判断时间）。
 * 便于统计回放与测试；实际记录请用 `calculateChatCost`。
 */
export function calculateChatCostByTier(
  model: string,
  usage: ChatUsage,
  tier: PriceTier,
): ChatCostBreakdown {
  const pricing = getModelPricing(model)
  const hitTokens = safeTokens(usage.promptCacheHitTokens)
  const missTokens = safeTokens(usage.promptCacheMissTokens)
  const completionTokens = safeTokens(usage.completionTokens)

  const promptHitCost = (hitTokens * pricing.promptHit[tier]) / 1_000_000
  const promptMissCost = (missTokens * pricing.promptMiss[tier]) / 1_000_000
  const completionCost = (completionTokens * pricing.completion[tier]) / 1_000_000

  return {
    model: pricing.model,
    label: pricing.label,
    tier,
    promptHitCost,
    promptMissCost,
    completionCost,
    totalCost: promptHitCost + promptMissCost + completionCost,
  }
}

/**
 * 计算一次 Chat 请求的费用：按请求完成时刻（默认当前时间）的北京时间判定峰谷。
 */
export function calculateChatCost(
  model: string,
  usage: ChatUsage,
  at?: Date | number,
): ChatCostBreakdown {
  return calculateChatCostByTier(model, usage, resolvePriceTier(at))
}

function normalizeRequestCount(count: number | null | undefined): number {
  if (typeof count !== 'number' || !Number.isFinite(count) || count <= 0) return 0
  return Math.floor(count)
}

/** Search 计费：每次成功请求 0.005 元（1000 次 5 元） */
export function calculateSearchCost(billableCount: number = 1): number {
  return normalizeRequestCount(billableCount) * SEARCH_PRICE_PER_REQUEST
}

/** Fetch 计费：每次成功请求 0.005 元（1000 次 5 元） */
export function calculateFetchCost(billableCount: number = 1): number {
  return normalizeRequestCount(billableCount) * FETCH_PRICE_PER_REQUEST
}
