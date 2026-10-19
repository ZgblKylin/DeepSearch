/**
 * localStorage 安全封装。
 *
 * 浏览器隐私模式、配额不足或 JSON 损坏时静默降级，绝不抛异常打断应用。
 */

/** 本项目使用的全部 localStorage 键（与 PLAN 第 5 节一致） */
export const STORAGE_KEYS = {
  settings: 'deepsearch.settings.v1',
  usage: 'deepsearch.usage.v1',
} as const

export type StorageKey = (typeof STORAGE_KEYS)[keyof typeof STORAGE_KEYS]

function getStorage(): Storage | null {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return null
    return window.localStorage
  } catch {
    return null
  }
}

/** localStorage 是否可用（隐私模式可能不可用） */
export function hasStorage(): boolean {
  return getStorage() !== null
}

/** 读取 JSON；不存在、不可用或解析失败时返回 null */
export function readJson(key: string): unknown {
  const storage = getStorage()
  if (!storage) return null
  try {
    const raw = storage.getItem(key)
    if (raw === null) return null
    return JSON.parse(raw) as unknown
  } catch {
    return null
  }
}

/** 写入 JSON；返回是否成功 */
export function writeJson(key: string, value: unknown): boolean {
  const storage = getStorage()
  if (!storage) return false
  try {
    storage.setItem(key, JSON.stringify(value))
    return true
  } catch {
    return false
  }
}

/** 删除单键；不存在时也为成功 */
export function removeStorage(key: string): void {
  const storage = getStorage()
  if (!storage) return
  try {
    storage.removeItem(key)
  } catch {
    // 忽略删除失败
  }
}
