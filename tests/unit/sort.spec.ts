import { describe, expect, it } from 'vitest'

import { parseResultDate, sortResults } from '@/lib/sort'
import type { SearchResult } from '@/types'

function makeResult(overrides: Partial<SearchResult> & { title: string }): SearchResult {
  return {
    rerank_score: 0,
    url: 'https://example.com',
    snippet: '',
    summary: '',
    content: '',
    site_name: 'Example',
    site_icon: '',
    date: '',
    author: '',
    authority: null,
    ...overrides,
  }
}

describe('parseResultDate', () => {
  it('解析 YYYY-MM-DD 与带时间的日期前缀', () => {
    expect(parseResultDate('2024-05-06')).toBe(Date.UTC(2024, 4, 6))
    expect(parseResultDate('2024-05-06T12:30:00Z')).toBe(Date.UTC(2024, 4, 6))
    expect(parseResultDate(' 2024-05-06 ')).toBe(Date.UTC(2024, 4, 6))
  })

  it('空值与非法值返回 null', () => {
    expect(parseResultDate('')).toBeNull()
    expect(parseResultDate('   ')).toBeNull()
    expect(parseResultDate(undefined)).toBeNull()
    expect(parseResultDate(null)).toBeNull()
    expect(parseResultDate('not-a-date')).toBeNull()
    expect(parseResultDate('2024-13-40')).toBeNull()
  })
})

describe('sortResults：相关度', () => {
  it('按 rerank_score 降序', () => {
    const results = [
      makeResult({ title: 'a', rerank_score: 0.5 }),
      makeResult({ title: 'b', rerank_score: 1.8 }),
      makeResult({ title: 'c', rerank_score: 1.2 }),
    ]
    expect(sortResults(results, 'relevance').map((result) => result.title)).toEqual(['b', 'c', 'a'])
  })

  it('同分时保持原始顺序（稳定排序）', () => {
    const results = [
      makeResult({ title: 'first', rerank_score: 1 }),
      makeResult({ title: 'second', rerank_score: 1 }),
      makeResult({ title: 'third', rerank_score: 1 }),
    ]
    expect(sortResults(results, 'relevance').map((result) => result.title)).toEqual([
      'first',
      'second',
      'third',
    ])
  })

  it('不修改入参数组', () => {
    const results = [
      makeResult({ title: 'a', rerank_score: 0.1 }),
      makeResult({ title: 'b', rerank_score: 2 }),
    ]
    const sorted = sortResults(results, 'relevance')
    expect(sorted).not.toBe(results)
    expect(results.map((result) => result.title)).toEqual(['a', 'b'])
  })
})

describe('sortResults：最新', () => {
  it('按 date 降序，空日期最后', () => {
    const results = [
      makeResult({ title: 'no-date', rerank_score: 9, date: '' }),
      makeResult({ title: 'old', rerank_score: 0.1, date: '2023-01-01' }),
      makeResult({ title: 'new', rerank_score: 0.2, date: '2025-06-01' }),
      makeResult({ title: 'invalid', rerank_score: 9, date: 'unknown' }),
    ]
    expect(sortResults(results, 'latest').map((result) => result.title)).toEqual([
      'new',
      'old',
      'no-date',
      'invalid',
    ])
  })

  it('同一日期按 rerank_score 降序', () => {
    const results = [
      makeResult({ title: 'low', rerank_score: 0.3, date: '2024-01-01' }),
      makeResult({ title: 'high', rerank_score: 1.9, date: '2024-01-01' }),
      makeResult({ title: 'mid', rerank_score: 1.1, date: '2024-01-01' }),
    ]
    expect(sortResults(results, 'latest').map((result) => result.title)).toEqual([
      'high',
      'mid',
      'low',
    ])
  })

  it('日期相同时刻（含时间）视为同一天并按分数排序', () => {
    const results = [
      makeResult({ title: 'low', rerank_score: 0.3, date: '2024-01-01T08:00:00Z' }),
      makeResult({ title: 'high', rerank_score: 2, date: '2024-01-01T20:00:00Z' }),
    ]
    expect(sortResults(results, 'latest').map((result) => result.title)).toEqual(['high', 'low'])
  })

  it('全部为空日期时退化为相关度排序', () => {
    const results = [
      makeResult({ title: 'a', rerank_score: 0.2 }),
      makeResult({ title: 'b', rerank_score: 1.5 }),
    ]
    expect(sortResults(results, 'latest').map((result) => result.title)).toEqual(['b', 'a'])
  })

  it('空数组安全', () => {
    expect(sortResults([], 'latest')).toEqual([])
    expect(sortResults([], 'relevance')).toEqual([])
  })
})
