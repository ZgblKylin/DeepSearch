import { nextTick, onScopeDispose, watch } from 'vue'
import type { Ref } from 'vue'

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'area[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  'iframe',
  'object',
  'embed',
  '[contenteditable="true"]',
  '[tabindex]:not([tabindex="-1"])',
].join(',')

export interface FocusTrapOptions {
  /** Esc 回调 */
  onEscape?: () => void
  /** 打开时优先聚焦的元素；缺省为容器内首个可聚焦元素 */
  initialFocus?: () => HTMLElement | null
  /** 关闭时是否把焦点归还给打开前的元素，默认 true */
  restoreFocus?: boolean
}

function getFocusable(container: HTMLElement | null): HTMLElement[] {
  if (!container) return []
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
    (element) =>
      !element.hasAttribute('disabled') &&
      element.getAttribute('aria-hidden') !== 'true' &&
      element.tabIndex !== -1,
  )
}

/**
 * 弹窗焦点陷阱（PLAN 3.8）：
 * - 激活时记录当前焦点并聚焦首个可聚焦元素；
 * - Tab / Shift+Tab 在容器内循环；
 * - Esc 调用 onEscape；
 * - 关闭时归还焦点。
 */
export function useFocusTrap(
  container: Ref<HTMLElement | null>,
  active: Ref<boolean>,
  options: FocusTrapOptions = {},
): void {
  let previouslyFocused: HTMLElement | null = null

  const handleKeydown = (event: KeyboardEvent): void => {
    if (!active.value) return

    if (event.key === 'Escape') {
      if (!options.onEscape) return
      event.preventDefault()
      event.stopPropagation()
      options.onEscape()
      return
    }

    if (event.key !== 'Tab') return
    const focusable = getFocusable(container.value)
    if (focusable.length === 0) {
      event.preventDefault()
      container.value?.focus()
      return
    }

    const first = focusable[0]
    const last = focusable[focusable.length - 1]
    const current = document.activeElement as HTMLElement | null
    const inside = current ? container.value?.contains(current) ?? false : false

    if (event.shiftKey) {
      if (!inside || current === first) {
        event.preventDefault()
        last.focus()
      }
    } else if (!inside || current === last) {
      event.preventDefault()
      first.focus()
    }
  }

  watch(
    active,
    (isActive) => {
      if (isActive) {
        previouslyFocused = document.activeElement as HTMLElement | null
        document.addEventListener('keydown', handleKeydown, true)
        void nextTick(() => {
          if (!active.value) return
          const target = options.initialFocus?.() ?? getFocusable(container.value)[0]
          if (target) target.focus()
          else container.value?.focus()
        })
      } else {
        document.removeEventListener('keydown', handleKeydown, true)
        if (options.restoreFocus !== false) previouslyFocused?.focus()
        previouslyFocused = null
      }
    },
    { immediate: true, flush: 'post' },
  )

  onScopeDispose(() => {
    document.removeEventListener('keydown', handleKeydown, true)
  })
}
