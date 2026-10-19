import { ref } from 'vue'

function readQueryFromLocation(): string {
  if (typeof window === 'undefined') return ''
  try {
    return (new URLSearchParams(window.location.search).get('q') ?? '').trim()
  } catch {
    return ''
  }
}

/** 当前查询串（唯一事实来源）；空串表示首页 */
const query = ref<string>(readQueryFromLocation())

function buildTarget(value: string): string {
  if (!value) return window.location.pathname
  return `${window.location.pathname}?${new URLSearchParams({ q: value }).toString()}`
}

/**
 * 查询串路由（不引入 Vue Router）：
 * - `query`：当前 q；
 * - `navigate(q)`：写 `?q=` 并 pushState（空 q 回首页并删除查询串）；
 * - `goHome()`：等价 navigate('')；
 * - `syncFromLocation()`：popstate 时从地址栏恢复。
 */
export function useQueryRoute() {
  function navigate(next: string): void {
    const value = next.trim()
    if (typeof window === 'undefined') {
      query.value = value
      return
    }
    const target = buildTarget(value)
    const current = `${window.location.pathname}${window.location.search}`
    query.value = value
    if (target !== current) {
      window.history.pushState(null, '', target)
    }
  }

  function goHome(): void {
    navigate('')
  }

  function syncFromLocation(): void {
    query.value = readQueryFromLocation()
  }

  return { query, navigate, goHome, syncFromLocation }
}
