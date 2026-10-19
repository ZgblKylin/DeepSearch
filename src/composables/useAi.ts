/**
 * AI 会话单例（PLAN 3.5 / 6 节）。
 *
 * 状态机：
 *
 * ```
 * idle ──summarize()──▶ summarizing ──成功──▶ ready（摘要作为第一条消息，可直接问答）
 *                                           │
 *                                           └─ 结果卡片 startFromResult() ─▶ followup-loading
 *                                              ──Fetch + 摘要成功──▶ followup-ready（可继续问答）
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
  SUMMARY_CHAT_SYSTEM_PROMPT,
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
/** 最近一次由结果卡片触发的网页，用于失败重试 */
let lastResult: SearchResult | null = null

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
  lastResult = null
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
    messages.value = summary.value.trim()
      ? [{ role: 'assistant', content: summary.value }]
      : []
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
  baseMessages = context.messages

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
    messages.value = [{ role: 'assistant', content }]
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

/** 基于单条搜索结果进入对话（内部实现，已确认有 Key） */
async function doStartResult(focus: SearchResult): Promise<void> {
  const { query, results } = readSearchSnapshot()
  lastResult = focus
  sessionKey = ''
  resultsSnapshot.value = results
  mode.value = 'followup'
  summary.value = ''
  messages.value = []
  baseMessages = []
  sources.value = []
  notice.value = ''
  error.value = ''
  errorKind = null
  asking.value = false
  fetching.value = true
  fetchProgress.completed = 0
  fetchProgress.total = 1

  const request = beginRequest()
  phase.value = 'followup-loading'
  const { settings } = useSettings()
  const document: FollowupDocument = { result: focus, content: '', fetchFailed: true }
  let fetchError: unknown = null

  try {
    const page = await fetchPage(settings.apiKey, focus.url, request.signal)
    const content = page.content.trim()
    // usage 语义：success 表示“成功且正文非空”
    useUsage().recordFetch(content.length > 0)
    document.content = content
    document.fetchFailed = content.length === 0
  } catch (caught) {
    if (isAbortError(caught)) return
    useUsage().recordFetch(false)
    fetchError = caught
  } finally {
    if (isCurrent(request.id)) {
      fetching.value = false
      fetchProgress.completed = 1
    }
  }

  if (!isCurrent(request.id)) return

  const context = buildFollowupContext(query, [document])
  sources.value = context.sources
  baseMessages = context.messages

  if (context.fallbackCount > 0) {
    notice.value = '网页正文读取失败，已用搜索摘要补位。'
    if (fetchError) useUi().showError(fetchError, 'fetch')
  }

  try {
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
  const canAskHere = phase.value === 'ready' || phase.value === 'followup-ready'
  if (!text || !canAskHere || asking.value) return

  error.value = ''
  errorKind = null
  const history = messages.value
  messages.value = [...history, { role: 'user', content: text }]
  asking.value = true

  const request = beginRequest()
  const { settings } = useSettings()
  const base =
    mode.value === 'summary'
      ? baseMessages.map((message, index) =>
          index === 0 && message.role === 'system'
            ? { role: 'system' as const, content: SUMMARY_CHAT_SYSTEM_PROMPT }
            : message,
        )
      : baseMessages
  const questionMessages = buildAskMessages(base, history, text)

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
  // 由结果卡片发起的单网页会话优先；AI 开关重新打开时不覆盖当前对话
  if (
    mode.value === 'followup' &&
    (phase.value === 'followup-loading' || phase.value === 'followup-ready' || asking.value)
  ) {
    return
  }
  useUi().requireApiKey(() => {
    void doSummarize()
  })
}

/** 从结果卡片进入对话：重置聊天区域，Fetch 该网页并生成第一条回答 */
function startFromResult(result: SearchResult): void {
  useUi().requireApiKey(() => {
    const { settings, update } = useSettings()
    if (!settings.aiMode) update({ aiMode: true })
    void doStartResult(result)
  })
}

/** 发送一轮追问；Enter 发送、Shift+Enter 换行由输入组件处理 */
function ask(text: string): void {
  const question = text.trim()
  const canAskHere = phase.value === 'ready' || phase.value === 'followup-ready'
  if (!question || asking.value || !canAskHere) return
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
    if (lastResult) startFromResult(lastResult)
    else summarize()
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
  if (wasAsking && (phase.value === 'ready' || phase.value === 'followup-ready')) {
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
    startFromResult,
    ask,
    reset,
    abort,
    retry,
  }
}
