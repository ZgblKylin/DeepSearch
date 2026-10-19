/**
 * AI 会话单例（PLAN 3.5 / 6 节）。
 *
 * 状态机：
 *
 * ```
 * idle ──summarize()──▶ summarizing ──成功──▶ ready ──startFollowup()──▶
 * followup-loading ──Fetch + 背景摘要成功──▶ followup-ready
 *   ▲                                            │
 *   └──────────── error（可 retry）◀──────────────┘
 * ```
 *
 * 约定：
 * - 本 composable 不监听路由、不自动摘要：编排由 T5 调用 summarize/reset/abort；
 * - 每次请求递增序号并 abort 上一请求，过期响应直接丢弃；
 * - 同一次搜索结果再次开启 AI 模式时复用已有摘要，不重复计费；
 * - 历史只保留 `role` + `content`，不回传 reasoning_content；
 * - 失败保留已有结果（摘要/会话），错误内联展示并可重试。
 */

import { computed, reactive, ref, toValue } from 'vue'

import type { AiPhase, AiSource, ChatMessage, ChatUsage, SearchResult } from '@/types'
import {
  buildAskMessages,
  buildFollowupContext,
  buildSummaryContext,
  selectFollowupResults,
  toSources,
  type FollowupDocument,
} from '@/lib/aiContext'
import { chatCompletion, fetchPage } from '@/lib/api'
import { ApiError, isAbortError, normalizeUnknownError } from '@/lib/errors'
import { useSearch } from '@/composables/useSearch'
import { useSettings } from '@/stores/settings'
import { useUi } from '@/stores/ui'
import { useUsage } from '@/stores/usage'

/** 非流式 Chat 的输出上限 */
const MAX_TOKENS = 4096

/** 面板当前会话类型：摘要 / 追问 */
type AiSessionMode = 'summary' | 'followup'
/** 最后一次失败所处阶段，决定“重试”行为 */
type AiErrorKind = 'summary' | 'followup' | 'ask'

const phase = ref<AiPhase>('idle')
const mode = ref<AiSessionMode>('summary')
const summary = ref('')
const messages = ref<ChatMessage[]>([])
const sources = ref<AiSource[]>([])
const error = ref('')
/** 追问过程中“部分网页读取失败”等非阻断提示 */
const notice = ref('')
const fetching = ref(false)
const asking = ref(false)
const fetchProgress = reactive({ completed: 0, total: 0 })
/** 当前会话对应的搜索结果快照（用于标签统计与来源复用） */
const resultsSnapshot = ref<SearchResult[]>([])

/** 请求序号：只处理最新一次请求的响应 */
let requestId = 0
/** 当前请求的 AbortController（新请求会中止旧请求） */
let controller: AbortController | null = null
/** 追问的固定前缀消息（system + 材料），多轮对话时复用 */
let baseMessages: ChatMessage[] = []
/** 当前会话对应的搜索结果指纹，用于“同一次搜索复用摘要” */
let sessionKey = ''
let errorKind: AiErrorKind | null = null

const excellentCount = computed(
  () => resultsSnapshot.value.filter((result) => result.rerank_score >= 1.5).length,
)
const authorityCount = computed(
  () =>
    resultsSnapshot.value.filter(
      (result) => result.authority !== null && result.authority >= 3,
    ).length,
)
const busy = computed(
  () => phase.value === 'summarizing' || phase.value === 'followup-loading' || asking.value,
)

/** 读取 useSearch 单例的当前查询与结果（兼容 ref / reactive 两种暴露方式） */
function readSearchSnapshot(): { query: string; results: SearchResult[] } {
  const search = useSearch()
  const query = toValue(search.query) ?? ''
  const rawResults = toValue(search.results) as unknown
  return {
    query: String(query),
    results: Array.isArray(rawResults) ? (rawResults as SearchResult[]) : [],
  }
}

/** 搜索结果指纹：查询 + URL + 相关度；用于判断“同一次搜索结果” */
function makeSessionKey(query: string, results: readonly SearchResult[]): string {
  return `${query}::${results.map((result) => `${result.url}@${result.rerank_score}`).join('|')}`
}

function beginRequest(): { id: number; signal: AbortSignal } {
  controller?.abort()
  controller = new AbortController()
  requestId += 1
  return { id: requestId, signal: controller.signal }
}

function isCurrent(id: number): boolean {
  return id === requestId
}

function toErrorText(value: unknown): string {
  return normalizeUnknownError(value).message
}

function emptyResponseError(): ApiError {
  return new ApiError({
    status: null,
    code: 'invalid_response',
    message: 'AI 返回了空内容，请重试',
    context: 'chat',
  })
}

function recordChatResult(model: string, usage: ChatUsage): void {
  try {
    useUsage().recordChat(model, usage)
  } catch {
    // 统计失败不影响 AI 结果展示
  }
}

/** 清空会话状态（保留 storage / settings） */
function resetState(): void {
  phase.value = 'idle'
  mode.value = 'summary'
  summary.value = ''
  messages.value = []
  sources.value = []
  error.value = ''
  notice.value = ''
  fetching.value = false
  asking.value = false
  fetchProgress.completed = 0
  fetchProgress.total = 0
  resultsSnapshot.value = []
  baseMessages = []
  sessionKey = ''
  errorKind = null
}

/**
 * 同一次搜索结果复用已有摘要：
 * 返回 true 表示无需重新请求；从关闭/错误状态恢复时切换到摘要视图。
 */
function canReuseSession(key: string): boolean {
  if (!summary.value.trim() || key !== sessionKey) return false
  if (phase.value === 'ready' || phase.value === 'followup-ready') return true
  if (phase.value === 'summarizing' || phase.value === 'followup-loading') return true
  if (phase.value === 'idle' || phase.value === 'error') {
    phase.value = 'ready'
    mode.value = 'summary'
    error.value = ''
    errorKind = null
    messages.value = []
    baseMessages = []
    notice.value = ''
    return true
  }
  return false
}

/** 初始摘要（内部实现，已确认有 Key） */
async function doSummarize(): Promise<void> {
  const { query, results } = readSearchSnapshot()

  if (results.length === 0) {
    resetState()
    return
  }
  const key = makeSessionKey(query, results)
  if (canReuseSession(key)) return

  sessionKey = key
  resultsSnapshot.value = results
  mode.value = 'summary'
  summary.value = ''
  messages.value = []
  baseMessages = []
  sources.value = []
  notice.value = ''
  error.value = ''
  errorKind = null
  fetching.value = false
  asking.value = false

  const context = buildSummaryContext(query, results)
  sources.value = context.sources

  const request = beginRequest()
  phase.value = 'summarizing'
  const { settings } = useSettings()

  try {
    const result = await chatCompletion(settings.apiKey, {
      model: settings.aiModel,
      messages: context.messages,
      effort: settings.reasoningEffort,
      maxTokens: MAX_TOKENS,
      signal: request.signal,
    })
    if (!isCurrent(request.id)) return
    const content = result.content.trim()
    if (!content) throw emptyResponseError()
    summary.value = content
    sources.value = context.sources
    phase.value = 'ready'
    recordChatResult(result.model || settings.aiModel, result.usage)
  } catch (caught) {
    if (!isCurrent(request.id) || isAbortError(caught)) return
    phase.value = 'error'
    error.value = toErrorText(caught)
    errorKind = 'summary'
    useUi().showError(caught, 'chat')
  }
}

/** 进入追问模式（内部实现，已确认有 Key） */
async function doStartFollowup(): Promise<void> {
  const { query, results } = readSearchSnapshot()
  if (results.length === 0) return

  const key = makeSessionKey(query, results)
  sessionKey = key
  resultsSnapshot.value = results
  mode.value = 'followup'
  messages.value = []
  baseMessages = []
  sources.value = []
  notice.value = ''
  error.value = ''
  errorKind = null
  asking.value = false
  fetching.value = true
  fetchProgress.completed = 0
  fetchProgress.total = 0

  const selected = selectFollowupResults(results)
  if (selected.length === 0) {
    fetching.value = false
    return
  }
  fetchProgress.total = selected.length
  // 读取网页前先展示来源数量；材料拼装完成后会用 buildFollowupContext 的结果覆盖
  sources.value = toSources(selected)

  const request = beginRequest()
  phase.value = 'followup-loading'
  const { settings } = useSettings()
  const documents: FollowupDocument[] = []
  const fetchErrors: unknown[] = []

  try {
    await Promise.all(
      selected.map(async (result, index) => {
        try {
          const page = await fetchPage(settings.apiKey, result.url, request.signal)
          const content = page.content.trim()
          // usage 语义：success 表示“成功且正文非空”
          useUsage().recordFetch(content.length > 0)
          documents[index] = { result, content, fetchFailed: content.length === 0 }
        } catch (caught) {
          if (isAbortError(caught)) throw caught
          useUsage().recordFetch(false)
          fetchErrors.push(caught)
          documents[index] = { result, content: '', fetchFailed: true }
        } finally {
          if (isCurrent(request.id)) {
            fetchProgress.completed = Math.min(fetchProgress.completed + 1, selected.length)
          }
        }
      }),
    )

    if (!isCurrent(request.id)) return
    fetching.value = false

    const context = buildFollowupContext(query, documents)
    sources.value = context.sources
    baseMessages = context.messages

    if (context.fallbackCount > 0) {
      notice.value =
        context.fallbackCount === selected.length
          ? '网页正文读取失败，已用搜索摘要补位。'
          : `有 ${context.fallbackCount} 个网页读取失败，已用搜索摘要补位。`
    }
    // 全部失败：只弹一次错误弹窗，然后用搜索摘要补位继续生成背景摘要
    if (context.fallbackCount === selected.length && fetchErrors.length > 0) {
      useUi().showError(fetchErrors[0], 'fetch')
    }

    const result = await chatCompletion(settings.apiKey, {
      model: settings.aiModel,
      messages: context.messages,
      effort: settings.reasoningEffort,
      maxTokens: MAX_TOKENS,
      signal: request.signal,
    })
    if (!isCurrent(request.id)) return
    const background = result.content.trim()
    if (!background) throw emptyResponseError()

    messages.value = [{ role: 'assistant', content: background }]
    phase.value = 'followup-ready'
    recordChatResult(result.model || settings.aiModel, result.usage)
  } catch (caught) {
    if (!isCurrent(request.id) || isAbortError(caught)) return
    fetching.value = false
    phase.value = 'error'
    error.value = toErrorText(caught)
    errorKind = 'followup'
    useUi().showError(caught, 'chat')
  }
}

/** 追问一轮（内部实现，已确认有 Key 且前置校验通过） */
async function doAsk(question: string): Promise<void> {
  const text = question.trim()
  if (!text || phase.value !== 'followup-ready' || asking.value) return

  error.value = ''
  errorKind = null
  const history = messages.value
  messages.value = [...history, { role: 'user', content: text }]
  asking.value = true

  const request = beginRequest()
  const { settings } = useSettings()
  const questionMessages = buildAskMessages(baseMessages, history, text)

  try {
    const result = await chatCompletion(settings.apiKey, {
      model: settings.aiModel,
      messages: questionMessages,
      effort: settings.reasoningEffort,
      maxTokens: MAX_TOKENS,
      signal: request.signal,
    })
    if (!isCurrent(request.id)) return
    const content = result.content.trim()
    if (!content) throw emptyResponseError()
    messages.value = [...messages.value, { role: 'assistant', content }]
    asking.value = false
    recordChatResult(result.model || settings.aiModel, result.usage)
  } catch (caught) {
    if (!isCurrent(request.id) || isAbortError(caught)) return
    asking.value = false
    error.value = toErrorText(caught)
    errorKind = 'ask'
    useUi().showError(caught, 'chat')
  }
}

/** 生成初始摘要；无 Key 时先弹 Key 弹窗，保存后自动继续 */
function summarize(): void {
  useUi().requireApiKey(() => {
    void doSummarize()
  })
}

/** 进入追问模式：重置会话 → Fetch 前 3 条唯一 URL → 生成新背景摘要 */
function startFollowup(): void {
  useUi().requireApiKey(() => {
    void doStartFollowup()
  })
}

/** 发送一轮追问；Enter 发送、Shift+Enter 换行由输入组件处理 */
function ask(text: string): void {
  const question = text.trim()
  if (!question || asking.value || phase.value !== 'followup-ready') return
  useUi().requireApiKey(() => {
    void doAsk(question)
  })
}

/** 按最后一次失败阶段重试 */
function retry(): void {
  if (errorKind === 'summary') {
    summarize()
    return
  }
  if (errorKind === 'followup') {
    startFollowup()
    return
  }
  if (errorKind === 'ask') {
    const last = messages.value[messages.value.length - 1]
    if (last && last.role === 'user') {
      messages.value = messages.value.slice(0, -1)
      ask(last.content)
    }
  }
}

/** 新搜索 / 退出结果页时重置 AI 会话（由 T5 调用） */
function reset(): void {
  requestId += 1
  controller?.abort()
  controller = null
  resetState()
}

/**
 * 关闭 AI 模式时中止在途请求（由 T5 调用）：
 * - 摘要请求中止后回到 idle，重新开启会重新生成；
 * - 追问请求中止后回退到已有摘要视图，不丢失原摘要；
 * - 普通问答中止后移除未回答的用户消息。
 */
function abort(): void {
  requestId += 1
  controller?.abort()
  controller = null

  const wasAsking = asking.value
  asking.value = false
  fetching.value = false

  if (phase.value === 'summarizing') {
    phase.value = 'idle'
    summary.value = ''
    sources.value = []
    return
  }
  if (phase.value === 'followup-loading') {
    messages.value = []
    baseMessages = []
    notice.value = ''
    if (summary.value.trim()) {
      mode.value = 'summary'
      phase.value = 'ready'
    } else {
      phase.value = 'idle'
    }
    return
  }
  if (wasAsking && phase.value === 'followup-ready') {
    const last = messages.value[messages.value.length - 1]
    if (last && last.role === 'user') {
      messages.value = messages.value.slice(0, -1)
    }
  }
}

/**
 * AI 会话单例。
 *
 * 返回的 `phase` / `mode` / `summary` / ... 均为 ref 或 reactive 对象，
 * 组件中直接解构使用即可获得响应性。
 */
export function useAi() {
  return {
    phase,
    mode,
    summary,
    messages,
    sources,
    error,
    notice,
    fetchProgress,
    fetching,
    asking,
    busy,
    excellentCount,
    authorityCount,
    summarize,
    startFollowup,
    ask,
    reset,
    abort,
    retry,
  }
}
