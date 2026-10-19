import { describe, expect, it } from 'vitest'

import type { ChatUsage } from '@/types'
import {
  MODEL_PRICING,
  calculateChatCost,
  calculateChatCostByTier,
  calculateFetchCost,
  calculateSearchCost,
  getModelLabel,
  getModelPricing,
  isPeakTime,
  normalizeModelName,
  resolvePriceTier,
} from '@/lib/pricing'

function chatUsage(
  hit: number,
  miss: number,
  completion: number,
  reasoning = 0,
): ChatUsage {
  return {
    promptCacheHitTokens: hit,
    promptCacheMissTokens: miss,
    completionTokens: completion,
    reasoningTokens: reasoning,
    totalTokens: hit + miss + completion,
  }
}

/** 2026-10-19 是周一；以下时间均显式带 +08:00，避免依赖运行时区 */
const monday = (time: string): Date => new Date(`2026-10-19T${time}+08:00`)
const saturday = (time: string): Date => new Date(`2026-10-17T${time}+08:00`)
const friday = (time: string): Date => new Date(`2026-10-16T${time}+08:00`)

describe('价格表', () => {
  it('Flash / Pro 峰谷价格与 PLAN 第 5 节一致', () => {
    expect(MODEL_PRICING['deepseek-flash'].promptHit).toEqual({ peak: 0.04, offPeak: 0.02 })
    expect(MODEL_PRICING['deepseek-flash'].promptMiss).toEqual({ peak: 2, offPeak: 1 })
    expect(MODEL_PRICING['deepseek-flash'].completion).toEqual({ peak: 8, offPeak: 4 })

    expect(MODEL_PRICING['deepseek-v4-pro'].promptHit).toEqual({ peak: 0.3, offPeak: 0.15 })
    expect(MODEL_PRICING['deepseek-v4-pro'].promptMiss).toEqual({ peak: 9, offPeak: 4.5 })
    expect(MODEL_PRICING['deepseek-v4-pro'].completion).toEqual({ peak: 27, offPeak: 13.5 })
  })
})

describe('normalizeModelName / getModelPricing', () => {
  it('归一化价格别名与空白', () => {
    expect(normalizeModelName('deepseek-v4-flash')).toBe('deepseek-flash')
    expect(normalizeModelName('  deepseek-v4-flash  ')).toBe('deepseek-flash')
    expect(normalizeModelName('deepseek-flash')).toBe('deepseek-flash')
    expect(normalizeModelName('deepseek-v4-pro')).toBe('deepseek-v4-pro')
  })

  it('未知或空模型名回退 Flash', () => {
    expect(normalizeModelName('deepseek-chat')).toBe('deepseek-flash')
    expect(normalizeModelName('')).toBe('deepseek-flash')
    expect(normalizeModelName(null)).toBe('deepseek-flash')
    expect(normalizeModelName(undefined)).toBe('deepseek-flash')
    expect(getModelPricing('unknown-model').model).toBe('deepseek-flash')
    expect(getModelLabel('deepseek-v4-pro')).toBe('DeepSeek V4 Pro')
    expect(getModelLabel('deepseek-v4-flash')).toBe('DeepSeek Flash')
  })
})

describe('峰谷时段判定（Asia/Shanghai）', () => {
  it('工作日 9:00 / 12:00 / 14:00 / 18:00 边界', () => {
    expect(isPeakTime(monday('08:59:59'))).toBe(false)
    expect(isPeakTime(monday('09:00:00'))).toBe(true)
    expect(isPeakTime(monday('11:59:59'))).toBe(true)
    expect(isPeakTime(monday('12:00:00'))).toBe(false)
    expect(isPeakTime(monday('13:59:59'))).toBe(false)
    expect(isPeakTime(monday('14:00:00'))).toBe(true)
    expect(isPeakTime(monday('17:59:59'))).toBe(true)
    expect(isPeakTime(monday('18:00:00'))).toBe(false)
  })

  it('周末全天为低谷（含高峰区间内的时间）', () => {
    expect(isPeakTime(saturday('10:00:00'))).toBe(false)
    expect(isPeakTime(saturday('15:00:00'))).toBe(false)
    expect(isPeakTime(new Date('2026-10-18T10:00:00+08:00'))).toBe(false)
  })

  it('周五仍在工作日高峰，UTC 输入按北京时间换算', () => {
    expect(isPeakTime(friday('10:00:00'))).toBe(true)
    // 01:00Z = 北京时间 09:00（周一），属于高峰
    expect(isPeakTime(new Date('2026-10-19T01:00:00Z'))).toBe(true)
    // 04:00Z = 北京时间 12:00，进入午间低谷
    expect(isPeakTime(new Date('2026-10-19T04:00:00Z'))).toBe(false)
  })

  it('resolvePriceTier 与 isPeakTime 一致；非法时间按低谷处理', () => {
    expect(resolvePriceTier(monday('10:00:00'))).toBe('peak')
    expect(resolvePriceTier(saturday('10:00:00'))).toBe('offPeak')
    expect(resolvePriceTier(new Date('invalid'))).toBe('offPeak')
    expect(isPeakTime(new Date('invalid'))).toBe(false)
  })
})

describe('Chat 费用计算', () => {
  it('Flash 空闲价：命中 / 未命中 / 输出分别计价', () => {
    const usage = chatUsage(1_000_000, 500_000, 100_000)
    const breakdown = calculateChatCost('deepseek-flash', usage, saturday('10:00:00'))

    expect(breakdown.tier).toBe('offPeak')
    expect(breakdown.promptHitCost).toBeCloseTo(0.02, 10)
    expect(breakdown.promptMissCost).toBeCloseTo(0.5, 10)
    expect(breakdown.completionCost).toBeCloseTo(0.4, 10)
    expect(breakdown.totalCost).toBeCloseTo(0.92, 10)
  })

  it('Flash 高峰价按同一组 tokens 计价', () => {
    const usage = chatUsage(1_000_000, 500_000, 100_000)
    const breakdown = calculateChatCost('deepseek-flash', usage, monday('10:00:00'))

    expect(breakdown.tier).toBe('peak')
    expect(breakdown.totalCost).toBeCloseTo(1.84, 10)
  })

  it('Pro 空闲价与小 token 精度', () => {
    const usage = chatUsage(1_000_000, 500_000, 100_000)
    expect(calculateChatCost('deepseek-v4-pro', usage, saturday('10:00:00')).totalCost).toBeCloseTo(
      3.75,
      10,
    )

    const tiny = chatUsage(1234, 5678, 9012)
    const breakdown = calculateChatCost('deepseek-flash', tiny, monday('15:00:00'))
    expect(breakdown.totalCost).toBeCloseTo(
      (1234 * 0.04 + 5678 * 2 + 9012 * 8) / 1_000_000,
      12,
    )
  })

  it('价格别名 deepseek-v4-flash 按 Flash 计价', () => {
    const usage = chatUsage(1_000_000, 0, 0)
    const alias = calculateChatCost('deepseek-v4-flash', usage, monday('10:00:00'))
    const flash = calculateChatCost('deepseek-flash', usage, monday('10:00:00'))

    expect(alias.model).toBe('deepseek-flash')
    expect(alias.totalCost).toBeCloseTo(0.04, 10)
    expect(alias).toEqual(flash)
  })

  it('calculateChatCostByTier 允许显式指定档位', () => {
    const usage = chatUsage(1_000_000, 0, 0)
    expect(calculateChatCostByTier('deepseek-flash', usage, 'peak').totalCost).toBeCloseTo(0.04, 10)
    expect(calculateChatCostByTier('deepseek-flash', usage, 'offPeak').totalCost).toBeCloseTo(
      0.02,
      10,
    )
  })

  it('负值 / 非有限 tokens 按 0 处理', () => {
    const usage = chatUsage(-100, Number.NaN, 0)
    const breakdown = calculateChatCost('deepseek-flash', usage, monday('10:00:00'))
    expect(breakdown.totalCost).toBe(0)
  })
})

describe('Search / Fetch 费用', () => {
  it('每次 0.005 元，1000 次 5 元', () => {
    expect(calculateSearchCost(1)).toBeCloseTo(0.005, 12)
    expect(calculateSearchCost(1000)).toBeCloseTo(5, 12)
    expect(calculateFetchCost(1)).toBeCloseTo(0.005, 12)
    expect(calculateFetchCost(1000)).toBeCloseTo(5, 12)
  })

  it('0 / 负数 / 非整数请求数', () => {
    expect(calculateSearchCost(0)).toBe(0)
    expect(calculateFetchCost(-3)).toBe(0)
    expect(calculateSearchCost(2.9)).toBeCloseTo(0.01, 12)
    expect(calculateFetchCost(Number.NaN)).toBe(0)
  })
})
