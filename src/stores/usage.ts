/**
 * 本机用量统计单例（PLAN 第 6 节 `useUsage()`）。
 *
 * - `usage` 为响应式对象，组件直接读取；
 * - 每次记录后立即写 localStorage `deepsearch.usage.v1`；
 * - 写入失败（隐私模式 / 配额不足）时静默降级为“仅内存统计”，不抛异常；
 * - 监听 `storage` 事件，多标签页之间同步统计。
 */

import { reactive } from 'vue'

import type { ChatUsage, UsageStats } from '@/types'
import { STORAGE_KEYS, readJson, removeStorage, writeJson } from '@/lib/storage'
import {
  addChat,
  addFetch,
  addSearch,
  createEmptyUsage,
  normalizeUsage,
} from '@/lib/usage'

/** 读取并归一化持久化统计；键不存在 / 损坏时返回空统计 */
function loadUsage(): UsageStats {
  return normalizeUsage(readJson(STORAGE_KEYS.usage))
}

const usage = reactive<UsageStats>(loadUsage())

/** 写入当前统计；返回是否成功（失败时内存状态仍然有效） */
function persist(): boolean {
  return writeJson(STORAGE_KEYS.usage, usage)
}

/** 用 reducer 结果替换响应式根对象并持久化 */
function commit(next: UsageStats): void {
  Object.assign(usage, next)
  persist()
}

/** 记录一次成功的搜索（失败不要调用）；结果数为 0 时不计费 */
function recordSearch(resultCount: number): void {
  commit(addSearch(usage, resultCount))
}

/**
 * 记录一次网页抓取。
 *
 * `success` 表示“成功且正文非空”；失败或空正文不记录（调用方传入 false 即可）。
 */
function recordFetch(success: boolean): void {
  if (!success) return
  commit(addFetch(usage, success))
}

/** 记录一次成功的 Chat 请求；峰谷按记录时刻的北京时间判定 */
function recordChat(model: string, chatUsage: ChatUsage, at?: Date | number): void {
  commit(addChat(usage, model, chatUsage, at))
}

/** 清零统计（保留存储键，写入全零对象） */
function resetUsage(): void {
  commit({ ...createEmptyUsage(), updatedAt: Date.now() })
}

/** 清空统计并删除存储键（用于“清空数据”） */
function clearAll(): void {
  Object.assign(usage, createEmptyUsage())
  removeStorage(STORAGE_KEYS.usage)
}

/**
 * storage 事件同步：其他标签页写入 / 删除统计时刷新当前单例。
 * 损坏数据按空统计处理，不回写、不抛错。
 */
function handleStorage(event: StorageEvent): void {
  if (event.key !== STORAGE_KEYS.usage) return
  if (event.newValue === null) {
    Object.assign(usage, createEmptyUsage())
    return
  }
  try {
    Object.assign(usage, normalizeUsage(JSON.parse(event.newValue) as unknown))
  } catch {
    Object.assign(usage, createEmptyUsage())
  }
}

if (typeof window !== 'undefined') {
  window.addEventListener('storage', handleStorage)
}

/**
 * 统计单例：
 * - `usage`：响应式统计对象；
 * - `recordSearch(resultCount)` / `recordFetch(success)` / `recordChat(model, usage, at?)`；
 * - `resetUsage()`：清零统计；
 * - `clearAll()`：清零并删除 localStorage 键。
 */
export function useUsage() {
  return {
    usage,
    recordSearch,
    recordFetch,
    recordChat,
    resetUsage,
    clearAll,
  }
}
