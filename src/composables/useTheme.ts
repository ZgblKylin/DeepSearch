import { computed, ref, watch } from 'vue'
import type { ComputedRef } from 'vue'

import type { ResolvedTheme, ThemeMode } from '@/types'
import { useSettings } from '@/stores/settings'

const DARK_QUERY = '(prefers-color-scheme: dark)'

interface ThemeController {
  /** 用户选择的主题（light / dark / system） */
  theme: ComputedRef<ThemeMode>
  /** 实际生效的主题（写回 data-theme） */
  resolvedTheme: ComputedRef<ResolvedTheme>
  /** 修改主题并持久化 */
  setTheme: (theme: ThemeMode) => void
}

function applyTheme(theme: ResolvedTheme): void {
  if (typeof document === 'undefined') return
  document.documentElement.dataset.theme = theme
  document.documentElement.style.colorScheme = theme
  const meta = document.querySelector('meta[name="theme-color"]')
  meta?.setAttribute('content', theme === 'dark' ? '#0f1115' : '#ffffff')
}

let controller: ThemeController | null = null

/**
 * 主题单例：跟随系统模式时监听 prefers-color-scheme，并把实际主题写到
 * `<html data-theme>`；index.html 的内联脚本负责首屏前应用，避免闪白。
 */
export function useTheme(): ThemeController {
  if (controller) return controller

  const { settings, update } = useSettings()

  const media =
    typeof window !== 'undefined' && typeof window.matchMedia === 'function'
      ? window.matchMedia(DARK_QUERY)
      : null
  const systemDark = ref(media ? media.matches : false)

  if (media) {
    const handleChange = (event: MediaQueryListEvent): void => {
      systemDark.value = event.matches
    }
    if (typeof media.addEventListener === 'function') {
      media.addEventListener('change', handleChange)
    } else if (typeof media.addListener === 'function') {
      media.addListener(handleChange)
    }
  }

  const resolvedTheme = computed<ResolvedTheme>(() =>
    settings.theme === 'system' ? (systemDark.value ? 'dark' : 'light') : settings.theme,
  )

  watch(resolvedTheme, (theme) => applyTheme(theme), { immediate: true })

  controller = {
    theme: computed<ThemeMode>(() => settings.theme),
    resolvedTheme,
    setTheme: (theme: ThemeMode) => update({ theme }),
  }
  return controller
}
