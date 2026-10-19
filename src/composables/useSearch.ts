/**
 * 搜索状态单例（PLAN 第 6 节 `useSearch()`）。
 *
 * 职责：
 * - 维护 `query` / `results` / `loading` / `error` / `elapsedMs`；
 * - `run(q)` 校验长度、确保有 API Key、调用 `searchWeb`、记录本机统计；
 * - 新搜索取消旧请求，并用请求序号丢弃过期响应（避免竞态覆盖新结果）；
 * - 缺少 API Key 时置 `awaitingKey` 并打开 Key 弹窗，保存后自动继续本次搜索；
 *   关闭弹窗不保存时结果页显示“需要配置 API Key”的可操作状态（QA P2-1）；
 * - 失败时通过 `ui.showError` 弹全局错误弹窗，同时在 `error` 中保留页内错误；
 * - 主动取消（`cancel`）不弹错误。
 *
 * 注意：本单例不监听路由；集成层（T5）在路由变化时调用 `run(q)`。
 */

import { ref, shallowRef } from 'vue'

import { searchWeb } from '@/lib/api'
import { ApiError, isAbortError, normalizeUnknownError } from '@/lib/errors'
import { MAX_QUERY_LENGTH, countQueryChars, parseQuery, validateQuery } from '@/lib/query'
import { useSettings } from '@/stores/settings'
import { useUi } from '@/stores/ui'
import { useUsage } from '@/stores/usage'
import type { SearchResult } from '@/types'

const { settings } = useSettings()
const { requireApiKey, showError } = useUi()
const { recordSearch } = useUsage()

/** 当前已发起（最近一次）搜索的查询串 */
const query = ref('')
/** 当前结果；每次新搜索开始时立即清空旧结果（PLAN 3.3） */
const results = shallowRef<SearchResult[]>([])
const loading = ref(false)
const error = shallowRef<ApiError | null>(null)
/** 最近一次搜索耗时（毫秒） */
const elapsedMs = ref(0)
/** 是否已经完成过一次搜索（成功或失败）；用于区分“尚未搜索”和“空结果” */
const searched = ref(false)
/**
 * 缺少 API Key、等待用户配置。
 *
 * 此时 `ui.requireApiKey` 只是打开了 Key 弹窗，尚未真正发起搜索请求——
 * 结果页应显示“需要配置 API Key”的可操作状态，而不是落入加载骨架（QA P2-1）。
 */
const awaitingKey = ref(false)

/** 当前请求的 AbortController；新请求会取消旧请求 */
let controller: AbortController | null = null
/** 请求序号：只有最新序号的响应 / 错误可以写状态 */
let requestSeq = 0
/** 最近一次 run 的查询串（供 retry 使用） */
let lastQuery = ''
/** 正在执行的请求 Promise（同一 q 并发调用时复用） */
let activeRun: Promise<void> | null = null

/** 让在途请求失效（不弹错误） */
function invalidate(): void {
  requestSeq += 1
  controller?.abort()
  controller = null
  loading.value = false
  awaitingKey.value = false
}

/** 清空为首页初始状态 */
function resetToIdle(): void {
  invalidate()
  query.value = ''
  results.value = []
  error.value = null
  elapsedMs.value = 0
  searched.value = false
  lastQuery = ''
}

function createLocalError(code: string, message: string): ApiError {
  return new ApiError({ status: null, code, message, context: 'search' })
}

/** 实际发起一次搜索请求（调用前已确认有 API Key） */
async function execute(value: string): Promise<void> {
  const seq = requestSeq + 1
  requestSeq = seq
  controller?.abort()
  const localController = new AbortController()
  controller = localController

  const startedAt = Date.now()
  query.value = value
  loading.value = true
  error.value = null
  elapsedMs.value = 0
  results.value = []
  searched.value = false
  awaitingKey.value = false

  // ori_question：去掉语法 token 的纯文本；非空且不超过 128 字符时才发送（PLAN 3.4）
  const oriQuestion = parseQuery(value).oriQuestion
  const oriQuestionParam =
    oriQuestion && countQueryChars(oriQuestion) <= MAX_QUERY_LENGTH ? oriQuestion : undefined

  try {
    const data = await searchWeb(settings.apiKey, {
      query: value,
      count: settings.resultCount,
      oriQuestion: oriQuestionParam,
      signal: localController.signal,
    })

    // 过期响应直接丢弃
    if (seq !== requestSeq) return

    results.value = data
    elapsedMs.value = Date.now() - startedAt
    loading.value = false
    searched.value = true

    // 仅成功搜索计数；空结果仍计数，但由 usage store 按 resultCount 判定不计费
    try {
      recordSearch(data.length)
    } catch {
      // 统计失败不影响搜索结果展示
    }
  } catch (caught) {
    if (seq !== requestSeq) return
    if (isAbortError(caught)) {
      loading.value = false
      return
    }
    const normalized = caught instanceof ApiError ? caught : normalizeUnknownError(caught, 'search')
    error.value = normalized
    elapsedMs.value = Date.now() - startedAt
    loading.value = false
    searched.value = true
    showError(normalized, 'search')
  } finally {
    if (controller === localController) controller = null
  }
}

/**
 * 执行搜索。
 *
 * - 空查询：回到初始状态，不请求；
 * - 超过 128 个 Unicode 字符：只写本地错误（行内提示由输入框负责），不请求；
 * - 缺少 API Key：置 `awaitingKey` 并打开 Key 弹窗，保存后自动继续本次搜索；
 *   关闭弹窗不保存时保持该状态，由结果页显示可操作的 Key 配置入口。
 *
 * @returns 请求完成时 resolve；因缺少 Key 而排队时立即 resolve。
 */
function run(input: string): Promise<void> {
  const value = (input ?? '').trim()
  if (!value) {
    resetToIdle()
    return Promise.resolve()
  }

  const validation = validateQuery(value)
  if (!validation.valid) {
    invalidate()
    query.value = value
    results.value = []
    loading.value = false
    elapsedMs.value = 0
    searched.value = true
    error.value = createLocalError('invalid_query', validation.message)
    lastQuery = value
    return Promise.resolve()
  }

  // 同一 q 正在请求时复用，避免路由 watcher 与筛选栏重复触发（PLAN 3.1）
  if (loading.value && value === lastQuery) return activeRun ?? Promise.resolve()

  lastQuery = value
  return new Promise<void>((resolve) => {
    const accepted = requireApiKey(() => {
      awaitingKey.value = false
      activeRun = execute(value).finally(() => {
        activeRun = null
        resolve()
      })
    })
    // Key 弹窗已打开：本次调用立即返回，保存 Key 后由 requireApiKey 继续执行。
    // 若用户关闭弹窗而不保存，保持 awaitingKey=true，结果页据此显示可操作的 Key 状态。
    if (!accepted) {
      awaitingKey.value = true
      resolve()
    }
  })
}

/** 取消当前在途请求：不弹错误、不清空已有结果 */
function cancel(): void {
  invalidate()
}

/** 重试最近一次查询（失败后使用） */
function retry(): Promise<void> {
  return run(lastQuery || query.value)
}

/**
 * 搜索单例：状态为响应式 ref，方法为普通函数。
 * 在任意组件中调用返回同一份状态（模块级单例）。
 */
export function useSearch() {
  return {
    query,
    results,
    loading,
    error,
    elapsedMs,
    searched,
    awaitingKey,
    run,
    cancel,
    retry,
  }
}
