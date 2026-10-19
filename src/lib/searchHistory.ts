/**
 * 搜索历史（本地记忆）。
 *
 * 只保存用户主动提交的合法查询，按最近使用排序、去重并限制条数；
 * 读取通过 localStorage 安全封装，存储不可用时退化为空列表。
 */

import { MAX_QUERY_LENGTH } from '@/lib/query'
import { STORAGE_KEYS, readJson, removeStorage, writeJson } from '@/lib/storage'

/** 保留的历史条数 */
export const MAX_SEARCH_HISTORY = 10

/** 读取历史；过滤非法项、去重并截断，保证 UI 可安全使用 */
export function readSearchHistory(): string[] {
  const raw = readJson(STORAGE_KEYS.history)
  if (!Array.isArray(raw)) return []

  const seen = new Set<string>()
  const history: string[] = []
  for (const item of raw) {
    if (typeof item !== 'string') continue
    const value = item.trim()
    if (!value || value.length > MAX_QUERY_LENGTH || seen.has(value)) continue
    seen.add(value)
    history.push(value)
    if (history.length >= MAX_SEARCH_HISTORY) break
  }
  return history
}

/** 追加一次搜索；返回更新后的列表（最新在前） */
export function addSearchHistory(query: string): string[] {
  const value = query.trim()
  const current = readSearchHistory()
  if (!value || value.length > MAX_QUERY_LENGTH) return current

  const next = [value, ...current.filter((item) => item !== value)].slice(
    0,
    MAX_SEARCH_HISTORY,
  )
  writeJson(STORAGE_KEYS.history, next)
  return next
}

/** 清空搜索历史 */
export function clearSearchHistory(): void {
  removeStorage(STORAGE_KEYS.history)
}
