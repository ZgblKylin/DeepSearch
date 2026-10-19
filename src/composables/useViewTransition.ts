import { nextTick } from 'vue'

interface ViewTransitionLike {
  finished: Promise<void>
}

const FALLBACK_CLASS = 'vt-fallback'
const FALLBACK_DURATION_MS = 240

/** 用户是否要求减少动效 */
export function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

/** 浏览器是否支持 View Transitions API */
export function supportsViewTransition(): boolean {
  if (typeof document === 'undefined') return false
  return typeof document.startViewTransition === 'function'
}

function runFallbackTransition(update: () => void): void {
  if (typeof document === 'undefined') {
    update()
    return
  }
  const root = document.documentElement
  root.classList.add(FALLBACK_CLASS)
  try {
    update()
  } finally {
    window.setTimeout(() => root.classList.remove(FALLBACK_CLASS), FALLBACK_DURATION_MS)
  }
}

/**
 * 首页 ↔ 结果页的搜索框位移动画（PLAN 3.1）：
 * - 支持 View Transitions 且未要求 reduced-motion 时使用原生过渡；
 * - 否则降级为 `vt-fallback` 类的淡入/位移动画（见 base.css）。
 *
 * 调用方在 `run(update)` 内同步修改 `query`，由 Vue 完成 DOM 更新。
 */
export function useViewTransition() {
  function run(update: () => void): void {
    if (typeof document === 'undefined') {
      update()
      return
    }
    if (!prefersReducedMotion() && typeof document.startViewTransition === 'function') {
      try {
        const transition = document.startViewTransition(async () => {
          update()
          // 等 Vue 完成本帧 DOM 更新后再让浏览器抓取“新”快照，
          // 否则搜索框从 hero 移动到顶栏的位移动画会拿到旧位置。
          await nextTick()
        }) as unknown as ViewTransitionLike
        // 过渡被用户操作打断时避免未处理的 Promise 拒绝
        transition.finished.catch(() => undefined)
        return
      } catch {
        // 支持检测失败时降级
      }
    }
    runFallbackTransition(update)
  }

  return { run, supported: supportsViewTransition() }
}
