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

/** 请求载荷：`accept` 用于流式响应（`text/event-stream`） */
interface RequestPayload {
  method: 'GET' | 'POST'
  body?: unknown
  accept?: string
}

/** 请求句柄：响应本体、超时状态与清理函数 */
interface RequestHandles {
  response: Response
  /** 是否因超时被中止；body 读取阶段同样反映该状态 */
  readonly timedOut: boolean
  /** 清理超时定时器与调用方取消监听 */
  dispose: () => void
}

/**
 * 把请求与响应读取阶段的异常归一化为 `ApiError`。
 *
 * 超时与调用方取消都会以 AbortError 呈现，只有 `timedOut` 能区分二者：
 * 调用方取消必须保留原生 AbortError，由 UI 层静默忽略。
 */
function normalizeRequestError(
  error: unknown,
  timedOut: boolean,
  context: ApiErrorContext,
): never {
  if (error instanceof ApiError) throw error
  if (isAbortError(error)) {
    if (timedOut) {
      throw new ApiError({
        status: null,
        code: 'timeout',
        message: '请求超时，请稍后重试',
        context,
      })
    }
    throw error
  }
  throw new ApiError({
    status: null,
    code: 'network_error',
    message: '网络连接失败，请检查网络后重试',
    context,
  })
}

/**
 * 发起请求并返回响应句柄。
 *
 * 只覆盖连接与响应头阶段；body 读取由调用方负责，读取期间的异常需经
 * `normalizeRequestError` 归一化后才能交给 UI。
 */
async function performRequest(
  path: string,
  apiKey: string,
  payload: RequestPayload,
  options: RequestOptions,
): Promise<RequestHandles> {
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

  const dispose = (): void => {
    if (timer !== undefined) clearTimeout(timer)
    timer = undefined
    options.signal?.removeEventListener('abort', handleCallerAbort)
  }

  try {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${key}`,
      Accept: payload.accept ?? 'application/json',
    }
    if (payload.body !== undefined) headers['Content-Type'] = 'application/json'

    const response = await fetch(`${API_BASE_URL}${path}`, {
      method: payload.method,
      headers,
      body: payload.body === undefined ? undefined : JSON.stringify(payload.body),
      signal: controller.signal,
    })

    if (!response.ok) {
      throw await parseErrorResponse(response, options.context)
    }

    return {
      response,
      get timedOut() {
        return timedOut
      },
      dispose,
    }
  } catch (error) {
    dispose()
    normalizeRequestError(error, timedOut, options.context)
  }
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
  init: RequestPayload,
  options: RequestOptions,
): Promise<unknown> {
  const handles = await performRequest(path, apiKey, init, options)
  try {
    const text = await handles.response.text()
    if (!text.trim()) return null
    try {
      return JSON.parse(text) as unknown
    } catch {
      throw new ApiError({
        status: handles.response.status,
        code: 'invalid_response',
        message: '响应不是合法的 JSON',
        context: options.context,
      })
    }
  } catch (error) {
    normalizeRequestError(error, handles.timedOut, options.context)
  } finally {
    handles.dispose()
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

/**
 * 把 Search 响应体归一化为结果数组。
 *
 * 预取响应与正式请求响应共用此归一化，保证复用预取时得到相同形状的结果。
 */
export function normalizeSearchPayload(payload: unknown): SearchResult[] {
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

  return normalizeSearchPayload(payload)
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

/** 流式增量：正文与思考内容分别给出，思考内容不进入正文 */
export interface ChatStreamDelta {
  /** 正文增量 */
  content: string
  /** 思考内容增量 */
  reasoningContent: string
}

export interface ChatCompletionParams {
  model: AiModel
  messages: ChatMessage[]
  /** 思考挡位：off 时 thinking.disabled 且省略 reasoning_effort */
  effort: ReasoningEffort
  maxTokens?: number
  signal?: AbortSignal
  /** 提供时改用流式请求，按到达顺序回调增量；省略时保持一次性响应 */
  onDelta?: (delta: ChatStreamDelta) => void
}

/** 组装 Chat 请求体；不发送 temperature */
function buildChatBody(params: ChatCompletionParams): JsonObject {
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
  return body
}

/** 归一化一次性响应体 */
function normalizeChatPayload(payload: unknown, fallbackModel: AiModel): ChatResult {
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
    model: readString(payload.model, fallbackModel),
    finishReason: readString(firstChoice.finish_reason),
  }
}

/**
 * 解析一行 SSE。
 *
 * 只处理 `data:` 行：注释、事件名、空行与无法解析的负载一律忽略，
 * 使单个畸形分片不会中断整个流。
 */
function parseChatStreamEvent(line: string): { done: boolean; payload: unknown } | null {
  const trimmed = line.trim()
  if (!trimmed.startsWith('data:')) return null
  const data = trimmed.slice(5).trim()
  if (!data) return null
  if (data === '[DONE]') return { done: true, payload: null }
  try {
    return { done: false, payload: JSON.parse(data) as unknown }
  } catch {
    return null
  }
}

/**
 * 流式 Chat 请求：边读边通过 `onDelta` 回调增量。
 *
 * 请求体追加 `stream: true` 与 `stream_options.include_usage`，usage 由最后一个
 * 携带 usage 的 chunk 给出。正文与思考内容分开累积，思考内容不进入正文。
 */
async function streamChatCompletion(
  apiKey: string,
  body: JsonObject,
  params: ChatCompletionParams,
): Promise<ChatResult> {
  const handles = await performRequest(
    '/chat/completions',
    apiKey,
    {
      method: 'POST',
      body: { ...body, stream: true, stream_options: { include_usage: true } },
      accept: 'text/event-stream',
    },
    { timeoutMs: API_TIMEOUTS.chat, signal: params.signal, context: 'chat' },
  )

  let content = ''
  let reasoningContent = ''
  let usage: ChatUsage | null = null
  let finishReason = ''
  let model: string = params.model
  let completed = false

  try {
    const reader = handles.response.body?.getReader()
    if (!reader) {
      throw new ApiError({
        status: null,
        code: 'invalid_response',
        message: '流式响应缺少可读数据流',
        context: 'chat',
      })
    }

    const decoder = new TextDecoder()
    let buffer = ''

    while (!completed) {
      const chunk = await reader.read()
      if (chunk.done) break
      buffer += decoder.decode(chunk.value, { stream: true })

      let newline = buffer.indexOf('\n')
      while (newline !== -1) {
        const line = buffer.slice(0, newline).replace(/\r$/, '')
        buffer = buffer.slice(newline + 1)
        newline = buffer.indexOf('\n')

        const event = parseChatStreamEvent(line)
        if (!event) continue
        if (event.done) {
          completed = true
          break
        }
        if (!isObject(event.payload)) continue
        const payload = event.payload

        if (typeof payload.model === 'string' && payload.model) model = payload.model
        if (isObject(payload.usage)) usage = normalizeChatUsage(payload.usage)

        const choices = Array.isArray(payload.choices) ? payload.choices : []
        const choice = isObject(choices[0]) ? choices[0] : null
        if (!choice) continue

        const finish = readString(choice.finish_reason)
        if (finish) finishReason = finish

        const delta = isObject(choice.delta) ? choice.delta : null
        if (!delta) continue
        const text = readString(delta.content)
        const reasoning = readString(delta.reasoning_content)
        if (text) content += text
        if (reasoning) reasoningContent += reasoning
        if (text || reasoning) params.onDelta?.({ content: text, reasoningContent: reasoning })
      }
    }

    await reader.cancel().catch(() => undefined)
  } catch (error) {
    normalizeRequestError(error, handles.timedOut, 'chat')
  } finally {
    handles.dispose()
  }

  return {
    content,
    reasoningContent,
    usage: usage ?? normalizeChatUsage(null),
    model,
    finishReason,
  }
}

/**
 * POST /chat/completions。
 *
 * 不发送 temperature；挡位关闭时 `thinking: { type: 'disabled' }` 且省略
 * `reasoning_effort`。提供 `onDelta` 时改用流式响应，首字延迟从「完整生成」
 * 降到首个 chunk 到达；省略 `onDelta` 时保持一次性响应。
 */
export async function chatCompletion(
  apiKey: string,
  params: ChatCompletionParams,
): Promise<ChatResult> {
  const body = buildChatBody(params)
  if (params.onDelta) return streamChatCompletion(apiKey, body, params)

  const payload = await requestJson(
    '/chat/completions',
    apiKey,
    { method: 'POST', body },
    { timeoutMs: API_TIMEOUTS.chat, signal: params.signal, context: 'chat' },
  )

  return normalizeChatPayload(payload, params.model)
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
