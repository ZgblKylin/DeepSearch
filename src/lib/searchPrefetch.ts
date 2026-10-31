/**
 * 搜索请求预取。
 *
 * 预取把请求起点提前到页面可执行之前：`index.html` 的 head 内联脚本在 HTML 解析阶段
 * 发出 `?q=` 对应的搜索请求，搜索框提交则在路由跳转与 View Transition 之前发出。
 * 正式执行时仅当全部请求参数一致才复用预取响应，否则中止预取并重新请求。
 *
 * 复用条件必须覆盖 query、count、oriQuestion 与 apiKey：任一项不同都意味着
 * 预取请求与正式请求的响应体可能不同。预取失败一律 resolve null，由正式请求重试，
 * 不向调用方抛出错误。
 */

import { normalizeSearchPayload, searchWeb } from '@/lib/api'
import { MAX_QUERY_LENGTH, countQueryChars, parseQuery } from '@/lib/query'
import { DEFAULT_SETTINGS, RESULT_COUNT_MAX, RESULT_COUNT_MIN } from '@/types'
import type { SearchResult } from '@/types'

/**
 * 预取结果的最长保留时间。
 *
 * Search 请求自身的超时为 20 秒，超过该窗口的预取已不可能是有效响应；
 * 保留更长的窗口只会让正式请求等待一个注定失败的 Promise。
 */
export const PREFETCH_MAX_AGE_MS = 30_000

/** `index.html` head 内联脚本挂载到 window 的预取记录（两侧共同维护此契约） */
export interface HeadSearchPrefetch {
  query: string
  count: number
  /** 折叠空白后的纯文本；空串表示正式请求不发送 ori_question */
  oriQuestion: string
  apiKey: string
  startedAt: number
  /** 成功时 resolve 搜索响应体，失败时 resolve null */
  promise: Promise<unknown>
  /** 中止仍在途的预取请求 */
  abort: () => void
}

/** 一次搜索请求中参与复用比对的参数 */
export interface SearchRequestParams {
  query: string
  count: number
  oriQuestion: string | undefined
}

/** 发起预取所需的参数 */
export interface StartPrefetchParams extends SearchRequestParams {
  apiKey: string
}

/** 已从预取登记中取出的句柄 */
export interface PrefetchHandle {
  /** 成功时为结果数组；null 表示预取失败，调用方应当重新请求 */
  promise: Promise<SearchResult[] | null>
  /** 中止仍在途的预取请求 */
  abort: () => void
}

interface PrefetchRecord {
  params: SearchRequestParams
  apiKey: string
  startedAt: number
  promise: Promise<SearchResult[] | null>
  abort: () => void
}

interface WindowWithPrefetch extends Window {
  __DS_SEARCH_PREFETCH__?: HeadSearchPrefetch
}

/** 当前登记的预取；同一时刻最多一条，新预取覆盖旧预取 */
let pending: PrefetchRecord | null = null

function normalizeCount(value: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return DEFAULT_SETTINGS.resultCount
  return Math.min(RESULT_COUNT_MAX, Math.max(RESULT_COUNT_MIN, Math.round(value)))
}

/**
 * 计算正式请求参数。
 *
 * `ori_question` 只在非空且不超过长度上限时发送，与 `searchWeb` 的请求体约定一致；
 * 预取侧必须使用同一套规则，否则两侧请求体不同，复用校验会永远失败。
 */
export function resolveSearchRequestParams(query: string, count: number): SearchRequestParams {
  const value = (query ?? '').trim()
  const oriQuestion = parseQuery(value).oriQuestion
  return {
    query: value,
    count: normalizeCount(count),
    oriQuestion:
      oriQuestion && countQueryChars(oriQuestion) <= MAX_QUERY_LENGTH ? oriQuestion : undefined,
  }
}

function isSameParams(left: SearchRequestParams, right: SearchRequestParams): boolean {
  return (
    left.query === right.query &&
    left.count === right.count &&
    left.oriQuestion === right.oriQuestion
  )
}

/** 丢弃当前预取并中止在途请求 */
export function clearSearchPrefetch(): void {
  pending?.abort()
  pending = null
}

/**
 * 接管 head 内联脚本写入的预取记录。
 *
 * 读取后即从 window 删除，重复调用不会重复登记。
 */
function adoptHeadPrefetch(): void {
  if (typeof window === 'undefined') return
  const host = window as WindowWithPrefetch
  const raw = host.__DS_SEARCH_PREFETCH__
  if (!raw) return
  delete host.__DS_SEARCH_PREFETCH__

  const apiKey = typeof raw.apiKey === 'string' ? raw.apiKey.trim() : ''
  if (!apiKey) return

  const promise = Promise.resolve(raw.promise)
    .then((payload) => (payload ? normalizeSearchPayload(payload) : null))
    .catch(() => null)

  pending = {
    params: {
      query: typeof raw.query === 'string' ? raw.query.trim() : '',
      count: normalizeCount(Number(raw.count)),
      oriQuestion:
        typeof raw.oriQuestion === 'string' && raw.oriQuestion.trim()
          ? raw.oriQuestion.trim()
          : undefined,
    },
    apiKey,
    startedAt: Number.isFinite(raw.startedAt) ? raw.startedAt : Date.now(),
    promise,
    abort: typeof raw.abort === 'function' ? raw.abort : () => undefined,
  }
}

/**
 * 发起预取。
 *
 * 缺少 API Key 时直接返回：`requestJson` 必然以 `missing_api_key` 失败，
 * 此时预取只会白等一个拒绝。
 */
export function startSearchPrefetch(input: StartPrefetchParams): void {
  // 先接管 head 记录：否则新预取会与尚未接管的 head 预取并存，
  // 后续取出时被 head 记录覆盖而白白丢弃。
  adoptHeadPrefetch()

  const apiKey = (input.apiKey ?? '').trim()
  if (!apiKey) return

  const params: SearchRequestParams = {
    query: (input.query ?? '').trim(),
    count: normalizeCount(input.count),
    oriQuestion: input.oriQuestion,
  }

  if (pending && pending.apiKey === apiKey && isSameParams(pending.params, params)) return

  clearSearchPrefetch()

  const controller = new AbortController()
  pending = {
    params,
    apiKey,
    startedAt: Date.now(),
    promise: searchWeb(apiKey, {
      query: params.query,
      count: params.count,
      oriQuestion: params.oriQuestion,
      signal: controller.signal,
    }).catch(() => null),
    abort: () => controller.abort(),
  }
}

/**
 * 取出与给定参数匹配的预取。
 *
 * 参数不一致、已过期或缺少预取时返回 null，并中止不再可能被复用的在途请求。
 */
export function takeSearchPrefetch(input: StartPrefetchParams): PrefetchHandle | null {
  adoptHeadPrefetch()

  const record = pending
  if (!record) return null

  const params: SearchRequestParams = {
    query: (input.query ?? '').trim(),
    count: normalizeCount(input.count),
    oriQuestion: input.oriQuestion,
  }
  const apiKey = (input.apiKey ?? '').trim()

  const reusable =
    record.apiKey === apiKey &&
    isSameParams(record.params, params) &&
    Date.now() - record.startedAt <= PREFETCH_MAX_AGE_MS

  pending = null
  if (!reusable) {
    record.abort()
    return null
  }

  return { promise: record.promise, abort: record.abort }
}

/**
 * 等待预取响应，并把正式请求的取消信号转发给预取请求。
 *
 * 正式请求被取消时预取同样中止，避免继续占用连接与额度。
 */
export async function awaitSearchPrefetch(
  handle: PrefetchHandle,
  signal: AbortSignal,
): Promise<SearchResult[] | null> {
  if (signal.aborted) {
    handle.abort()
    return null
  }

  const onAbort = (): void => handle.abort()
  signal.addEventListener('abort', onAbort, { once: true })
  try {
    return await handle.promise
  } finally {
    signal.removeEventListener('abort', onAbort)
  }
}
