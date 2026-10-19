import type {
  AiModel,
  ApiErrorContext,
  ChatMessage,
  ChatResult,
  ChatUsage,
  ReasoningEffort,
  SearchResult,
} from '@/types'
import { ApiError, isAbortError, parseErrorResponse } from '@/lib/errors'

export { ApiError, isApiError } from '@/lib/errors'

/** DeepSeek API 基址（浏览器直连，CORS 由服务端反射 Origin） */
export const API_BASE_URL = 'https://api.deepseek.com'

/** 各接口超时（毫秒）：Search 20s、Chat 120s、Fetch 30s、测试连接 15s */
export const API_TIMEOUTS = {
  search: 20_000,
  chat: 120_000,
  fetch: 30_000,
  test: 15_000,
} as const

type JsonObject = Record<string, unknown>

interface RequestOptions {
  timeoutMs: number
  context: ApiErrorContext
  signal?: AbortSignal
}

function isObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function readString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback
}

function readNumber(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

/**
 * 通用 JSON 请求：
 * - 自动带 Bearer 与 JSON Content-Type；
 * - AbortController 同时响应调用方取消与超时；
 * - 非 2xx 归一化为 ApiError，纯文本响应也可解析；
 * - 调用方主动取消时抛出原生 AbortError，由 UI 层静默忽略。
 */
async function requestJson(
  path: string,
  apiKey: string,
  init: { method: 'GET' | 'POST'; body?: unknown },
  options: RequestOptions,
): Promise<unknown> {
  const key = apiKey.trim()
  if (!key) {
    throw new ApiError({
      status: null,
      code: 'missing_api_key',
      message: '尚未配置 API Key，请先在设置中保存',
      context: options.context,
    })
  }

  const controller = new AbortController()
  let timedOut = false
  let timer: ReturnType<typeof setTimeout> | undefined

  const handleCallerAbort = () => controller.abort()

  if (options.signal) {
    if (options.signal.aborted) controller.abort()
    else options.signal.addEventListener('abort', handleCallerAbort, { once: true })
  }
  timer = setTimeout(() => {
    timedOut = true
    controller.abort()
  }, options.timeoutMs)

  try {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${key}`,
      Accept: 'application/json',
    }
    if (init.body !== undefined) headers['Content-Type'] = 'application/json'

    const response = await fetch(`${API_BASE_URL}${path}`, {
      method: init.method,
      headers,
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
      signal: controller.signal,
    })

    if (!response.ok) {
      throw await parseErrorResponse(response, options.context)
    }

    const text = await response.text()
    if (!text.trim()) return null
    try {
      return JSON.parse(text) as unknown
    } catch {
      throw new ApiError({
        status: response.status,
        code: 'invalid_response',
        message: '响应不是合法的 JSON',
        context: options.context,
      })
    }
  } catch (error) {
    if (error instanceof ApiError) throw error
    if (isAbortError(error)) {
      if (timedOut) {
        throw new ApiError({
          status: null,
          code: 'timeout',
          message: '请求超时，请稍后重试',
          context: options.context,
        })
      }
      // 调用方主动取消：保留原生 AbortError，不弹错误弹窗
      throw error
    }
    throw new ApiError({
      status: null,
      code: 'network_error',
      message: '网络连接失败，请检查网络后重试',
      context: options.context,
    })
  } finally {
    if (timer !== undefined) clearTimeout(timer)
    options.signal?.removeEventListener('abort', handleCallerAbort)
  }
}

function normalizeSearchResult(value: unknown): SearchResult | null {
  if (!isObject(value)) return null
  const url = readString(value.url).trim()
  if (!url) return null
  return {
    rerank_score: readNumber(value.rerank_score),
    title: readString(value.title).trim() || url,
    url,
    snippet: readString(value.snippet),
    summary: readString(value.summary),
    content: readString(value.content),
    site_name: readString(value.site_name),
    site_icon: readString(value.site_icon),
    date: readString(value.date),
    author: readString(value.author),
    authority:
      typeof value.authority === 'number' && Number.isFinite(value.authority)
        ? value.authority
        : null,
  }
}

export interface SearchWebParams {
  query: string
  count: number
  /** 去掉搜索语法 token 的纯文本；非空时发送，否则省略字段 */
  oriQuestion?: string
  signal?: AbortSignal
}

/**
 * POST /v1/tools/search
 *
 * 请求体严格为 query / count / need_content / ori_question，**完全省略 localization**。
 */
export async function searchWeb(
  apiKey: string,
  params: SearchWebParams,
): Promise<SearchResult[]> {
  const body: JsonObject = {
    query: params.query,
    count: params.count,
    need_content: false,
  }
  const oriQuestion = params.oriQuestion?.trim()
  if (oriQuestion) body.ori_question = oriQuestion

  const payload = await requestJson(
    '/v1/tools/search',
    apiKey,
    { method: 'POST', body },
    { timeoutMs: API_TIMEOUTS.search, signal: params.signal, context: 'search' },
  )

  if (!isObject(payload) || !Array.isArray(payload.results)) {
    throw new ApiError({
      status: null,
      code: 'invalid_response',
      message: '搜索响应缺少 results 数组',
      context: 'search',
    })
  }

  return payload.results
    .map(normalizeSearchResult)
    .filter((result): result is SearchResult => result !== null)
}

function normalizeChatUsage(value: unknown): ChatUsage {
  const usage = isObject(value) ? value : {}
  const details = isObject(usage.completion_tokens_details)
    ? usage.completion_tokens_details
    : {}
  return {
    promptCacheHitTokens: readNumber(usage.prompt_cache_hit_tokens),
    promptCacheMissTokens: readNumber(usage.prompt_cache_miss_tokens),
    completionTokens: readNumber(usage.completion_tokens),
    reasoningTokens: readNumber(details.reasoning_tokens),
    totalTokens: readNumber(usage.total_tokens),
  }
}

export interface ChatCompletionParams {
  model: AiModel
  messages: ChatMessage[]
  /** 思考挡位：off 时 thinking.disabled 且省略 reasoning_effort */
  effort: ReasoningEffort
  maxTokens?: number
  signal?: AbortSignal
}

/**
 * POST /chat/completions（非流式）
 *
 * 不发送 temperature；挡位关闭时 `thinking: { type: 'disabled' }` 且省略 reasoning_effort。
 */
export async function chatCompletion(
  apiKey: string,
  params: ChatCompletionParams,
): Promise<ChatResult> {
  const body: JsonObject = {
    model: params.model,
    messages: params.messages.map((message) => ({
      role: message.role,
      content: message.content,
    })),
    max_tokens: params.maxTokens ?? 4096,
  }
  if (params.effort === 'off') {
    body.thinking = { type: 'disabled' }
  } else {
    body.thinking = { type: 'enabled' }
    body.reasoning_effort = params.effort
  }

  const payload = await requestJson(
    '/chat/completions',
    apiKey,
    { method: 'POST', body },
    { timeoutMs: API_TIMEOUTS.chat, signal: params.signal, context: 'chat' },
  )

  const choices = isObject(payload) ? payload.choices : undefined
  const firstChoice = Array.isArray(choices) ? choices[0] : undefined
  const message = isObject(firstChoice) ? firstChoice.message : undefined
  if (!isObject(payload) || !isObject(message)) {
    throw new ApiError({
      status: null,
      code: 'invalid_response',
      message: 'Chat 响应缺少 choices[0].message',
      context: 'chat',
    })
  }

  return {
    content: readString(message.content),
    reasoningContent: readString(message.reasoning_content),
    usage: normalizeChatUsage(payload.usage),
    model: readString(payload.model, params.model),
    finishReason: readString(firstChoice.finish_reason),
  }
}

export interface FetchPageResult {
  title: string
  content: string
}

/**
 * POST /v1/tools/fetch
 */
export async function fetchPage(
  apiKey: string,
  url: string,
  signal?: AbortSignal,
): Promise<FetchPageResult> {
  const payload = await requestJson(
    '/v1/tools/fetch',
    apiKey,
    { method: 'POST', body: { url } },
    { timeoutMs: API_TIMEOUTS.fetch, signal, context: 'fetch' },
  )

  if (!isObject(payload)) {
    throw new ApiError({
      status: null,
      code: 'invalid_response',
      message: '网页读取响应格式异常',
      context: 'fetch',
    })
  }

  return {
    title: readString(payload.title),
    content: readString(payload.content),
  }
}

export interface TestApiKeyResult {
  models: string[]
  elapsedMs: number
}

function extractModels(payload: unknown): string[] | null {
  if (!isObject(payload)) return null
  const candidates = payload.data ?? payload.models
  if (!Array.isArray(candidates)) return null

  const models: string[] = []
  for (const item of candidates) {
    if (typeof item === 'string' && item.trim()) {
      models.push(item.trim())
      continue
    }
    if (isObject(item)) {
      const id = readString(item.id).trim()
      const name = readString(item.name).trim()
      if (id) models.push(id)
      else if (name) models.push(name)
    }
  }
  return models
}

/**
 * GET /models：验证 Key 是否可用，不产生 token 费用。
 */
export async function testApiKey(apiKey: string): Promise<TestApiKeyResult> {
  const startedAt = Date.now()
  const payload = await requestJson(
    '/models',
    apiKey,
    { method: 'GET' },
    { timeoutMs: API_TIMEOUTS.test, context: 'test' },
  )
  const elapsedMs = Date.now() - startedAt
  const models = extractModels(payload)
  if (models === null) {
    throw new ApiError({
      status: null,
      code: 'invalid_response',
      message: '模型列表响应格式异常',
      context: 'test',
    })
  }
  return { models, elapsedMs }
}
