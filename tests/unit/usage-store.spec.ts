import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { ChatUsage } from '@/types'
import { STORAGE_KEYS } from '@/lib/storage'
import { useUsage } from '@/stores/usage'

const PEAK_TIME = new Date('2026-10-19T10:00:00+08:00')

function chatUsage(hit: number, miss: number, completion: number): ChatUsage {
  return {
    promptCacheHitTokens: hit,
    promptCacheMissTokens: miss,
    completionTokens: completion,
    reasoningTokens: 0,
    totalTokens: hit + miss + completion,
  }
}

function readStoredUsage(): Record<string, unknown> | null {
  const raw = window.localStorage.getItem(STORAGE_KEYS.usage)
  if (raw === null) return null
  return JSON.parse(raw) as Record<string, unknown>
}

const { usage, recordSearch, recordFetch, recordChat, resetUsage, clearAll } = useUsage()

beforeEach(() => {
  resetUsage()
})

describe('useUsage 记录与持久化', () => {
  it('recordSearch 更新响应式状态并写入 localStorage', () => {
    recordSearch(8)

    expect(usage.searches).toBe(1)
    expect(usage.searchBillable).toBe(1)
    expect(usage.searchCost).toBeCloseTo(0.005, 12)

    const stored = readStoredUsage()
    expect(stored).not.toBeNull()
    expect(stored?.searches).toBe(1)
    expect(stored?.searchBillable).toBe(1)
  })

  it('recordFetch(false) 不记录，recordFetch(true) 计次并持久化', () => {
    recordFetch(false)
    expect(usage.fetches).toBe(0)

    recordFetch(true)
    expect(usage.fetches).toBe(1)
    expect(usage.fetchBillable).toBe(1)
    expect(usage.fetchCost).toBeCloseTo(0.005, 12)
    expect(readStoredUsage()?.fetches).toBe(1)
  })

  it('recordChat 持久化模型用量与峰谷费用', () => {
    recordChat('deepseek-flash', chatUsage(1_000_000, 0, 0), PEAK_TIME)

    expect(usage.models['deepseek-flash'].requests).toBe(1)
    expect(usage.models['deepseek-flash'].peakCost).toBeCloseTo(0.04, 10)

    const stored = readStoredUsage() as {
      models: Record<string, { peakCost: number; requests: number }>
    }
    expect(stored.models['deepseek-flash'].requests).toBe(1)
    expect(stored.models['deepseek-flash'].peakCost).toBeCloseTo(0.04, 10)
  })

  it('resetUsage 清零但保留存储键', () => {
    recordSearch(3)
    recordChat('deepseek-flash', chatUsage(10, 10, 10), PEAK_TIME)
    resetUsage()

    expect(usage.searches).toBe(0)
    expect(usage.searchCost).toBe(0)
    expect(usage.models).toEqual({})
    expect(usage.updatedAt).toBeGreaterThan(0)
    expect(readStoredUsage()?.searches).toBe(0)
  })

  it('clearAll 清零并删除存储键', () => {
    recordChat('deepseek-flash', chatUsage(10, 10, 10), PEAK_TIME)
    clearAll()

    expect(usage.searches).toBe(0)
    expect(usage.models).toEqual({})
    expect(window.localStorage.getItem(STORAGE_KEYS.usage)).toBeNull()
  })

  it('localStorage 写入失败时降级为仅内存统计，不抛异常', () => {
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota exceeded')
    })

    expect(() => recordSearch(2)).not.toThrow()
    expect(usage.searches).toBe(1)
    expect(usage.searchCost).toBeCloseTo(0.005, 12)

    spy.mockRestore()
  })
})

describe('storage 事件同步', () => {
  it('其他标签页写入时刷新当前单例', () => {
    const newValue = JSON.stringify({
      searches: 4,
      searchBillable: 2,
      searchCost: 0.01,
      fetches: 1,
      fetchBillable: 1,
      fetchCost: 0.005,
      models: {
        'deepseek-flash': {
          promptHitTokens: 7,
          promptMissTokens: 0,
          completionTokens: 0,
          reasoningTokens: 0,
          requests: 1,
          peakCost: 0.01,
          offPeakCost: 0,
        },
      },
      updatedAt: 42,
    })

    window.dispatchEvent(
      new StorageEvent('storage', { key: STORAGE_KEYS.usage, newValue }),
    )

    expect(usage.searches).toBe(4)
    expect(usage.searchBillable).toBe(2)
    expect(usage.models['deepseek-flash'].promptHitTokens).toBe(7)
    expect(usage.updatedAt).toBe(42)
  })

  it('存储键被删除时清零', () => {
    recordSearch(1)
    expect(usage.searches).toBe(1)

    window.dispatchEvent(
      new StorageEvent('storage', { key: STORAGE_KEYS.usage, newValue: null }),
    )

    expect(usage.searches).toBe(0)
    expect(usage.models).toEqual({})
  })

  it('忽略非本应用的存储键与损坏 JSON', () => {
    recordSearch(1)
    const searches = usage.searches

    window.dispatchEvent(
      new StorageEvent('storage', { key: 'other.key', newValue: '{}' }),
    )
    expect(usage.searches).toBe(searches)

    window.dispatchEvent(
      new StorageEvent('storage', { key: STORAGE_KEYS.usage, newValue: '{broken' }),
    )
    expect(usage.searches).toBe(0)
  })
})
