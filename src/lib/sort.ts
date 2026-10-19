/**
 * 搜索结果排序（PLAN 3.3）。
 *
 * - 相关度：`rerank_score` 降序；
 * - 最新：`date` 降序，空/非法日期最后；同一日期按 `rerank_score` 降序。
 *
 * 所有函数均为纯函数，返回新数组，不修改入参；比较相等时保持原始顺序
 * （依赖 ES2019 起 `Array.prototype.sort` 的稳定性）。
 */

import type { SearchResult, SortMode } from '@/types'

const DATE_PREFIX = /^(\d{4})-(\d{2})-(\d{2})/u

/**
 * 解析结果日期为可比较的时间戳（UTC 当日 0 点）。
 *
 * 支持 `YYYY-MM-DD` 前缀（API 返回值可能带时间）与其它 `Date.parse` 可解析格式；
 * 空值 / 非法值返回 `null`，排序时统一排到最后。
 */
export function parseResultDate(value: string | null | undefined): number | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  if (!trimmed) return null

  const prefix = DATE_PREFIX.exec(trimmed)
  if (prefix) {
    const year = Number(prefix[1])
    const month = Number(prefix[2])
    const day = Number(prefix[3])
    if (month < 1 || month > 12 || day < 1 || day > 31) return null
    const timestamp = Date.UTC(year, month - 1, day)
    const date = new Date(timestamp)
    if (
      date.getUTCFullYear() !== year ||
      date.getUTCMonth() !== month - 1 ||
      date.getUTCDate() !== day
    ) {
      return null
    }
    return timestamp
  }

  const parsed = Date.parse(trimmed)
  return Number.isNaN(parsed) ? null : parsed
}

/** 相关度比较：`rerank_score` 降序；非法分数按 0 处理 */
function compareRelevance(a: SearchResult, b: SearchResult): number {
  const scoreA = Number.isFinite(a.rerank_score) ? a.rerank_score : 0
  const scoreB = Number.isFinite(b.rerank_score) ? b.rerank_score : 0
  return scoreB - scoreA
}

/**
 * 排序结果。
 *
 * @param results 原始结果（不会被修改）
 * @param mode 相关度 / 最新
 */
export function sortResults(results: readonly SearchResult[], mode: SortMode): SearchResult[] {
  const list = [...results]
  if (mode === 'latest') {
    list.sort((a, b) => {
      const dateA = parseResultDate(a.date)
      const dateB = parseResultDate(b.date)
      if (dateA === null && dateB === null) return compareRelevance(a, b)
      // 空日期 / 非法日期始终排在有效日期之后
      if (dateA === null) return 1
      if (dateB === null) return -1
      if (dateA !== dateB) return dateB - dateA
      return compareRelevance(a, b)
    })
    return list
  }

  list.sort(compareRelevance)
  return list
}
