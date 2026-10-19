import { beforeEach } from 'vitest'

/**
 * Vitest 全局准备：
 * - jsdom 未实现 matchMedia，注入最小桩供 useTheme / useViewTransition 使用；
 * - 每个用例前清空 localStorage，避免设置/统计单例互相污染。
 */
if (typeof window.matchMedia !== 'function') {
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    addListener: () => undefined,
    removeListener: () => undefined,
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia
}

beforeEach(() => {
  window.localStorage.clear()
})
