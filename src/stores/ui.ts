import { computed, reactive } from 'vue'

import type {
  ApiErrorContext,
  ApiKeyModalState,
  ErrorModalState,
  ToastKind,
  ToastState,
} from '@/types'
import {
  ApiError,
  errorContextTitle,
  isAbortError,
  isApiErrorContext,
  normalizeUnknownError,
} from '@/lib/errors'
import { useSettings } from '@/stores/settings'

type PendingAction = () => void | Promise<void>

const { settings, update: updateSettings } = useSettings()

/** 全局 UI 单例状态 */
const ui = reactive({
  apiKeyModal: { open: false } as ApiKeyModalState,
  errorModal: { open: false, title: '', error: null } as ErrorModalState,
  settingsOpen: false,
  toast: { message: '', kind: 'info', visible: false } as ToastState,
})

let pendingAction: PendingAction | null = null
let toastTimer: ReturnType<typeof setTimeout> | null = null

function runAction(action: PendingAction): void {
  try {
    const result = action()
    if (result && typeof result.then === 'function') {
      result.catch((error: unknown) => showError(error))
    }
  } catch (error) {
    showError(error)
  }
}

function requireApiKey(action: PendingAction): boolean {
  if (settings.apiKey.trim()) {
    runAction(action)
    return true
  }
  pendingAction = action
  ui.apiKeyModal.open = true
  return false
}

function openApiKeyModal(action?: PendingAction): void {
  pendingAction = action ?? null
  ui.apiKeyModal.open = true
}

function closeApiKeyModal(): void {
  ui.apiKeyModal.open = false
  pendingAction = null
}

/** 保存 Key（空值返回 false），关闭弹窗、toast 提示，并继续被拦截的操作 */
function saveApiKey(raw: string): boolean {
  const key = raw.trim()
  if (!key) return false
  updateSettings({ apiKey: key })
  ui.apiKeyModal.open = false
  showToast('API Key 已保存', 'success')
  const action = pendingAction
  pendingAction = null
  if (action) queueMicrotask(() => runAction(action))
  return true
}

function showError(error: unknown, context?: ApiErrorContext | string): void {
  // 用户主动取消 / 新请求取消旧请求：不弹错误
  if (isAbortError(error)) return
  const fallbackContext = isApiErrorContext(context) ? context : undefined
  const normalized =
    error instanceof ApiError ? error : normalizeUnknownError(error, fallbackContext)
  ui.errorModal.title = errorContextTitle(context ?? normalized.context ?? null)
  ui.errorModal.error = normalized
  ui.errorModal.open = true
}

function closeErrorModal(): void {
  ui.errorModal.open = false
  ui.errorModal.error = null
}

function openSettings(): void {
  ui.settingsOpen = true
}

function closeSettings(): void {
  ui.settingsOpen = false
}

function showToast(message: string, kind: ToastKind = 'info'): void {
  if (toastTimer !== null) clearTimeout(toastTimer)
  ui.toast.message = message
  ui.toast.kind = kind
  ui.toast.visible = true
  toastTimer = setTimeout(() => {
    ui.toast.visible = false
    toastTimer = null
  }, 2400)
}

function dismissToast(): void {
  if (toastTimer !== null) {
    clearTimeout(toastTimer)
    toastTimer = null
  }
  ui.toast.visible = false
}

const settingsOpen = computed<boolean>({
  get: () => ui.settingsOpen,
  set: (value: boolean) => {
    ui.settingsOpen = value
  },
})

/**
 * 全局 UI 单例（PLAN 第 6 节）：
 * - 状态：`apiKeyModal` / `errorModal` / `settingsOpen` / `toast`（`ui` 为根对象，便于整体读取）；
 * - `requireApiKey(action)`：已有 Key 立即执行并返回 true，否则排队并打开 Key 弹窗；
 * - `showError(error, context)`：归一化后打开错误弹窗，主动取消静默忽略；
 * - `openSettings()` / `showToast(message, kind)`。
 */
export function useUi() {
  return {
    ui,
    apiKeyModal: ui.apiKeyModal,
    errorModal: ui.errorModal,
    toast: ui.toast,
    settingsOpen,
    requireApiKey,
    showError,
    closeErrorModal,
    openSettings,
    closeSettings,
    openApiKeyModal,
    closeApiKeyModal,
    saveApiKey,
    showToast,
    dismissToast,
  }
}
