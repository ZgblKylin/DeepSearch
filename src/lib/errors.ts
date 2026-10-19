import type { ApiErrorContext, ApiErrorView } from '@/types'

export interface ApiErrorInit {
  /** HTTP 状态码；网络错误 / 超时为 null */
  status?: number | null
  /** 归一化错误码；缺省用 type，再缺省 http_<status> */
  code?: string
  /** 服务端错误类型 */
  type?: string
  /** 面向用户的错误消息 */
  message?: string
  /** 服务端请求 ID（若响应头或响应体提供） */
  requestId?: string
  /** 请求上下文 */
  context?: ApiErrorContext
}

const DEFAULT_MESSAGES: Record<string, string> = {
  network_error: '网络连接失败，请检查网络后重试',
  timeout: '请求超时，请稍后重试',
  invalid_response: '响应格式异常，请稍后重试',
  missing_api_key: '尚未配置 DeepSeek API Key',
  aborted: '请求已取消',
}

/**
 * 全站统一 API 错误。
 *
 * 归一化规则（PLAN 第 4 节）：
 * - JSON 错误体取 `error.message` / `error.type` / `error.code`；
 * - code 缺失用 type，再缺失 `http_<status>`；
 * - 纯文本响应整体作为 message；
 * - 网络错误 `network_error`、超时 `timeout`、解析失败 `invalid_response`。
 */
export class ApiError extends Error implements ApiErrorView {
  readonly status: number | null
  readonly code: string
  readonly type?: string
  readonly requestId?: string
  readonly context?: ApiErrorContext

  constructor(init: ApiErrorInit) {
    const status = init.status ?? null
    const code = init.code ?? (status === null ? 'network_error' : `http_${status}`)
    const fallback =
      DEFAULT_MESSAGES[code] ?? (status === null ? '请求失败' : `HTTP ${status}`)
    const message = init.message?.trim() ? init.message.trim() : fallback
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
    this.type = init.type
    this.requestId = init.requestId
    this.context = init.context
  }
}

const ERROR_CONTEXT_TITLES: Record<ApiErrorContext, string> = {
  search: '搜索失败',
  chat: 'AI 请求失败',
  fetch: '网页读取失败',
  test: '连接测试失败',
}

/** 判断是否为已知请求上下文 */
export function isApiErrorContext(value: unknown): value is ApiErrorContext {
  return value === 'search' || value === 'chat' || value === 'fetch' || value === 'test'
}

/**
 * 错误弹窗标题：已知上下文映射为中文标题；未知字符串视为自定义标题。
 */
export function errorContextTitle(context?: ApiErrorContext | string | null): string {
  if (context && isApiErrorContext(context)) return ERROR_CONTEXT_TITLES[context]
  if (typeof context === 'string' && context.trim()) return context.trim()
  return '请求失败'
}

/** 面向用户的 HTTP 状态码建议（401/402/429/5xx/网络） */
export function statusSuggestion(status: number | null): string {
  if (status === null) return '请检查网络连接后重试。'
  if (status === 401) return '请检查 API Key 是否正确或已失效。'
  if (status === 402) return '账户余额不足，请前往 DeepSeek 开放平台充值。'
  if (status === 429) return '请求过于频繁或额度受限，请稍后再试。'
  if (status >= 500 && status <= 599) return '服务端暂时不可用，请稍后重试。'
  return ''
}

/** 判断是否为 ApiError */
export function isApiError(value: unknown): value is ApiError {
  return value instanceof ApiError
}

/** 判断是否为调用方主动取消（不弹错误弹窗） */
export function isAbortError(value: unknown): boolean {
  if (typeof DOMException !== 'undefined' && value instanceof DOMException) {
    return value.name === 'AbortError'
  }
  return value instanceof Error && value.name === 'AbortError'
}

function extractErrorFields(payload: unknown): {
  message?: string
  code?: string
  type?: string
  requestId?: string
} {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return {}
  const record = payload as Record<string, unknown>
  const nested = record.error
  const target =
    nested && typeof nested === 'object' && !Array.isArray(nested)
      ? (nested as Record<string, unknown>)
      : record

  const fields: { message?: string; code?: string; type?: string; requestId?: string } = {}
  if (typeof target.message === 'string' && target.message.trim()) {
    fields.message = target.message.trim()
  }
  if (typeof target.code === 'string' && target.code.trim()) {
    fields.code = target.code.trim()
  }
  if (typeof target.type === 'string' && target.type.trim()) {
    fields.type = target.type.trim()
  }
  const requestId = target.request_id ?? target.requestId ?? record.request_id ?? record.requestId
  if (typeof requestId === 'string' && requestId.trim()) {
    fields.requestId = requestId.trim()
  }
  return fields
}

function readRequestId(response: Response): string | undefined {
  const headers = response.headers
  if (!headers) return undefined
  const value =
    headers.get('x-request-id') ??
    headers.get('x-ds-request-id') ??
    headers.get('x-requestid') ??
    undefined
  return value?.trim() || undefined
}

/**
 * 把非 2xx 响应归一化为 ApiError。
 * 兼容 JSON 错误体、纯文本错误体、空响应体。
 */
export async function parseErrorResponse(
  response: Response,
  context?: ApiErrorContext,
): Promise<ApiError> {
  const headerRequestId = readRequestId(response)
  let text = ''
  try {
    text = (await response.text()).trim()
  } catch {
    text = ''
  }

  let fields: ReturnType<typeof extractErrorFields> = {}
  if (text) {
    try {
      fields = extractErrorFields(JSON.parse(text) as unknown)
    } catch {
      // 纯文本响应：整体作为 message
    }
  }

  const type = fields.type
  const code = fields.code ?? type ?? `http_${response.status}`
  const message = fields.message ?? text ?? `HTTP ${response.status}`

  return new ApiError({
    status: response.status,
    code,
    type,
    message,
    requestId: fields.requestId ?? headerRequestId,
    context,
  })
}

/** 把任意异常归一化为 ApiError（调用方主动取消不展示，由 UI 层过滤） */
export function normalizeUnknownError(error: unknown, context?: ApiErrorContext): ApiError {
  if (error instanceof ApiError) return error
  if (isAbortError(error)) {
    return new ApiError({ status: null, code: 'aborted', message: '请求已取消', context })
  }
  const detail = error instanceof Error ? error.message.trim() : ''
  return new ApiError({
    status: null,
    code: 'network_error',
    message: detail ? `${DEFAULT_MESSAGES.network_error}（${detail}）` : DEFAULT_MESSAGES.network_error,
    context,
  })
}

/** 错误弹窗“复制详情”的文本 */
export function formatErrorDetails(error: ApiErrorView | null): string {
  if (!error) return ''
  const lines = [
    `HTTP 状态码：${error.status ?? '—'}`,
    `错误码：${error.code || '—'}`,
  ]
  if (error.type) lines.push(`错误类型：${error.type}`)
  lines.push(`错误消息：${error.message || '—'}`)
  if (error.requestId) lines.push(`请求 ID：${error.requestId}`)
  if (error.context) lines.push(`请求上下文：${error.context}`)
  return lines.join('\n')
}
