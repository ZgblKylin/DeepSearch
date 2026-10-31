import { afterEach, describe, expect, it, vi } from 'vitest'

import { useViewTransition } from '@/composables/useViewTransition'

/**
 * 页面过渡策略：
 * - 窄屏与 reduced-motion 直接切换，不做整页快照；
 * - 宽屏且支持 View Transitions 时使用原生过渡。
 */
const originalMatchMedia = window.matchMedia
const originalStartViewTransition = Object.getOwnPropertyDescriptor(
  document,
  'startViewTransition',
)

function stubMatchMedia(matchesByQuery: (query: string) => boolean): void {
  window.matchMedia = ((query: string) => ({
    matches: matchesByQuery(query),
    media: query,
    onchange: null,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    addListener: () => undefined,
    removeListener: () => undefined,
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia
}

function stubStartViewTransition(
  implementation: (callback: () => void | Promise<void>) => unknown,
): ReturnType<typeof vi.fn> {
  const spy = vi.fn(implementation)
  Object.defineProperty(document, 'startViewTransition', {
    value: spy,
    configurable: true,
  })
  return spy
}

afterEach(() => {
  window.matchMedia = originalMatchMedia
  if (originalStartViewTransition) {
    Object.defineProperty(document, 'startViewTransition', originalStartViewTransition)
  } else {
    Reflect.deleteProperty(document, 'startViewTransition')
  }
})

describe('useViewTransition', () => {
  it('窄屏直接切换，不做整页快照', () => {
    stubMatchMedia((query) => query.includes('max-width: 768px'))
    const startViewTransition = stubStartViewTransition(() => ({ finished: Promise.resolve() }))
    const update = vi.fn()

    useViewTransition().run(update)

    expect(update).toHaveBeenCalledTimes(1)
    expect(startViewTransition).not.toHaveBeenCalled()
  })

  it('prefers-reduced-motion 时直接切换', () => {
    stubMatchMedia((query) => query.includes('prefers-reduced-motion'))
    const startViewTransition = stubStartViewTransition(() => ({ finished: Promise.resolve() }))
    const update = vi.fn()

    useViewTransition().run(update)

    expect(update).toHaveBeenCalledTimes(1)
    expect(startViewTransition).not.toHaveBeenCalled()
  })

  it('宽屏且支持时使用原生过渡', () => {
    stubMatchMedia(() => false)
    const startViewTransition = stubStartViewTransition((callback) => {
      // 原生实现会执行回调并等待其返回的 Promise，这里同步执行以观察 DOM 更新
      void callback()
      return { finished: Promise.resolve() }
    })
    const update = vi.fn()

    useViewTransition().run(update)

    expect(startViewTransition).toHaveBeenCalledTimes(1)
    expect(update).toHaveBeenCalledTimes(1)
  })
})
