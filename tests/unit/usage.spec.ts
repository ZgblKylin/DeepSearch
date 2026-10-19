import { describe, expect, it } from 'vitest'

import type { ChatUsage, UsageStats } from '@/types'
import {
  addChat,
  addFetch,
  addSearch,
  createEmptyUsage,
  createModelUsage,
  modelTotalCost,
  modelTotalTokens,
  normalizeUsage,
  totalCost,
  totalTokens,
  usageModelRows,
} from '@/lib/usage'

const PEAK_TIME = new Date('2026-10-19T10:00:00+08:00')
const OFF_PEAK_TIME = new Date('2026-10-17T10:00:00+08:00')

function chatUsage(hit: number, miss: number, completion: number): ChatUsage {
  return {
    promptCacheHitTokens: hit,
    promptCacheMissTokens: miss,
    completionTokens: completion,
    reasoningTokens: 0,
    totalTokens: hit + miss + completion,
  }
}

describe('createEmptyUsage / createModelUsage', () => {
  it('空统计初始值全零', () => {
    expect(createEmptyUsage()).toEqual({
      searches: 0,
      searchBillable: 0,
      searchCost: 0,
      fetches: 0,
      fetchBillable: 0,
      fetchCost: 0,
      models: {},
      updatedAt: 0,
    })
    expect(createModelUsage()).toEqual({
      promptHitTokens: 0,
      promptMissTokens: 0,
      completionTokens: 0,
      reasoningTokens: 0,
      requests: 0,
      peakCost: 0,
      offPeakCost: 0,
    })
  })
})

describe('normalizeUsage', () => {
  it('空值 / 损坏数据回退为空统计', () => {
    expect(normalizeUsage(null)).toEqual(createEmptyUsage())
    expect(normalizeUsage('broken')).toEqual(createEmptyUsage())
    expect(normalizeUsage({ searches: 'x', models: 42 })).toEqual(createEmptyUsage())
  })

  it('非法字段回退 0 并保留合法字段', () => {
    const usage = normalizeUsage({
      searches: 3.9,
      searchBillable: 'x',
      searchCost: -1,
      fetches: -2,
      fetchBillable: 2,
      fetchCost: 0.01,
      updatedAt: 123,
      models: {
        'deepseek-flash': {
          promptHitTokens: 10,
          promptMissTokens: 20,
          completionTokens: 30,
          reasoningTokens: 5,
          requests: 1,
          peakCost: 0.001,
          offPeakCost: 0.002,
        },
      },
    })

    expect(usage.searches).toBe(3)
    expect(usage.searchBillable).toBe(0)
    expect(usage.searchCost).toBe(0)
    expect(usage.fetches).toBe(0)
    expect(usage.fetchBillable).toBe(2)
    expect(usage.fetchCost).toBe(0.01)
    expect(usage.updatedAt).toBe(123)
    expect(usage.models['deepseek-flash']).toEqual({
      promptHitTokens: 10,
      promptMissTokens: 20,
      completionTokens: 30,
      reasoningTokens: 5,
      requests: 1,
      peakCost: 0.001,
      offPeakCost: 0.002,
    })
  })

  it('模型别名与未知模型合并到 Flash', () => {
    const usage = normalizeUsage({
      models: {
        'deepseek-v4-flash': { promptHitTokens: 10, requests: 1 },
        'deepseek-flash': { promptHitTokens: 1, requests: 1 },
        'unknown-model': { promptHitTokens: 2 },
      },
    })

    expect(Object.keys(usage.models)).toEqual(['deepseek-flash'])
    expect(usage.models['deepseek-flash'].promptHitTokens).toBe(13)
    expect(usage.models['deepseek-flash'].requests).toBe(2)
  })
})

describe('addSearch', () => {
  it('成功搜索：searches +1；非空结果额外计费', () => {
    const next = addSearch(createEmptyUsage(), 8, 1000)

    expect(next.searches).toBe(1)
    expect(next.searchBillable).toBe(1)
    expect(next.searchCost).toBeCloseTo(0.005, 12)
    expect(next.updatedAt).toBe(1000)
  })

  it('结果为空：只计成功次数，不计费', () => {
    const next = addSearch(createEmptyUsage(), 0, 1000)

    expect(next.searches).toBe(1)
    expect(next.searchBillable).toBe(0)
    expect(next.searchCost).toBe(0)
  })

  it('不修改入参', () => {
    const usage = createEmptyUsage()
    addSearch(usage, 3, 1000)

    expect(usage.searches).toBe(0)
    expect(usage.searchCost).toBe(0)
    expect(usage.updatedAt).toBe(0)
  })
})

describe('addFetch', () => {
  it('成功抓取计次与计费', () => {
    const next = addFetch(createEmptyUsage(), true, 1000)

    expect(next.fetches).toBe(1)
    expect(next.fetchBillable).toBe(1)
    expect(next.fetchCost).toBeCloseTo(0.005, 12)
    expect(next.updatedAt).toBe(1000)
  })

  it('失败抓取不记录（返回原对象）', () => {
    const usage = createEmptyUsage()
    expect(addFetch(usage, false, 1000)).toBe(usage)
  })
})

describe('addChat', () => {
  it('高峰请求累计 token、请求数与 peakCost', () => {
    const next = addChat(
      createEmptyUsage(),
      'deepseek-flash',
      chatUsage(1_000_000, 500_000, 100_000),
      PEAK_TIME,
    )

    const model = next.models['deepseek-flash']
    expect(model.promptHitTokens).toBe(1_000_000)
    expect(model.promptMissTokens).toBe(500_000)
    expect(model.completionTokens).toBe(100_000)
    expect(model.requests).toBe(1)
    expect(model.peakCost).toBeCloseTo(1.84, 10)
    expect(model.offPeakCost).toBe(0)
    expect(next.updatedAt).toBeGreaterThan(0)
  })

  it('空闲请求累计 offPeakCost；同一模型再次请求时累加', () => {
    const once = addChat(
      createEmptyUsage(),
      'deepseek-flash',
      chatUsage(1_000_000, 0, 0),
      OFF_PEAK_TIME,
    )
    const twice = addChat(once, 'deepseek-flash', chatUsage(0, 0, 1_000_000), PEAK_TIME)

    const model = twice.models['deepseek-flash']
    expect(model.requests).toBe(2)
    expect(model.offPeakCost).toBeCloseTo(0.02, 10)
    expect(model.peakCost).toBeCloseTo(8, 10)
    expect(model.promptHitTokens).toBe(1_000_000)
    expect(model.completionTokens).toBe(1_000_000)
  })

  it('价格别名归一化到 Flash 且不产生独立模型行', () => {
    const next = addChat(
      createEmptyUsage(),
      'deepseek-v4-flash',
      chatUsage(1_000_000, 0, 0),
      PEAK_TIME,
    )

    expect(next.models['deepseek-v4-flash']).toBeUndefined()
    expect(next.models['deepseek-flash'].peakCost).toBeCloseTo(0.04, 10)
  })

  it('不同模型分别聚合', () => {
    let usage: UsageStats = createEmptyUsage()
    usage = addChat(usage, 'deepseek-flash', chatUsage(1000, 0, 0), PEAK_TIME)
    usage = addChat(usage, 'deepseek-v4-pro', chatUsage(1000, 0, 0), PEAK_TIME)

    expect(Object.keys(usage.models).sort()).toEqual([
      'deepseek-flash',
      'deepseek-v4-pro',
    ])
    expect(usage.models['deepseek-v4-pro'].peakCost).toBeCloseTo(0.0003, 12)
  })
})

describe('聚合读取', () => {
  const models = (): UsageStats => ({
    ...createEmptyUsage(),
    searches: 2,
    searchBillable: 1,
    searchCost: 0.005,
    fetches: 1,
    fetchBillable: 1,
    fetchCost: 0.005,
    models: {
      'deepseek-flash': {
        promptHitTokens: 100,
        promptMissTokens: 200,
        completionTokens: 300,
        reasoningTokens: 50,
        requests: 2,
        peakCost: 0.01,
        offPeakCost: 0.02,
      },
      'deepseek-v4-pro': {
        promptHitTokens: 1,
        promptMissTokens: 2,
        completionTokens: 3,
        reasoningTokens: 0,
        requests: 1,
        peakCost: 0.5,
        offPeakCost: 0.25,
      },
    },
    updatedAt: 1,
  })

  it('modelTotalTokens 不含 reasoningTokens（其为输出子集）', () => {
    expect(modelTotalTokens(models().models['deepseek-flash'])).toBe(600)
    expect(modelTotalCost(models().models['deepseek-flash'])).toBeCloseTo(0.03, 12)
  })

  it('totalTokens / totalCost 汇总全部模型与 Search / Fetch', () => {
    const usage = models()
    expect(totalTokens(usage)).toBe(606)
    expect(totalCost(usage)).toBeCloseTo(0.005 + 0.005 + 0.03 + 0.75, 12)
  })

  it('usageModelRows 按 Flash → Pro 顺序输出并带展示名', () => {
    const rows = usageModelRows(models())
    expect(rows.map((row) => row.model)).toEqual(['deepseek-flash', 'deepseek-v4-pro'])
    expect(rows.map((row) => row.label)).toEqual(['DeepSeek Flash', 'DeepSeek V4 Pro'])
    expect(rows[0].totalTokens).toBe(600)
    expect(rows[1].totalCost).toBeCloseTo(0.75, 12)
  })

  it('usageModelRows 忽略未记录的模型', () => {
    expect(usageModelRows(createEmptyUsage())).toEqual([])
  })
})
