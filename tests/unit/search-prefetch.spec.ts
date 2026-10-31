import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { searchWeb } from '@/lib/api'
import { MAX_QUERY_LENGTH } from '@/lib/query'
import {
  PREFETCH_MAX_AGE_MS,
  awaitSearchPrefetch,
  clearSearchPrefetch,
  resolveSearchRequestParams,
  startSearchPrefetch,
  takeSearchPrefetch,
} from '@/lib/searchPrefetch'
import { DEFAULT_SETTINGS, RESULT_COUNT_MAX, RESULT_COUNT_MIN } from '@/types'
import type { SearchResult } from '@/types'

/**
 * 预取复用契约（`index.html` head 脚本与本模块共同维护）：
 * - 全部请求参数一致时才复用预取响应，任一项不同都中止预取并回退到正式请求；
 * - 预取失败 resolve null，由正式请求重试；
 * - head 写入 window 的记录在首次取出时被接管，且只接管一次。
 *
 * 网络层 `@/lib/api` 的 `searchWeb` 被 mock，`normalizeSearchPayload` 保留真实实现。
 */
vi.mock('@/lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api')>()
  return { ...actual, searchWeb: vi.fn() }
})

const mockedSearchWeb = vi.mocked(searchWeb)

const API_KEY = 'sk-test-key'

type HeadPrefetchHost = Window & { __DS_SEARCH_PREFETCH__?: Record<string, unknown> }
const host = window as HeadPrefetchHost

function makeResult(overrides: Partial<SearchResult> = {}): SearchResult {
  return {
    rerank_score: 1.5,
    title: 'DeepSeek 官方文档',
    url: 'https://api-docs.deepseek.com/',
    snippet: '示例摘要',
    summary: '',
    content: '',
    site_name: 'DeepSeek',
    site_icon: '',
    date: '2026-10-01',
    author: '',
    authority: 4,
    ...overrides,
  }
}

/** 构造与给定查询一致的预取参数 */
function prefetchParams(query = 'DeepSeek', count = 10, apiKey = API_KEY) {
  return { ...resolveSearchRequestParams(query, count), apiKey }
}

beforeEach(() => {
  mockedSearchWeb.mockReset()
  clearSearchPrefetch()
  delete host.__DS_SEARCH_PREFETCH__
})

afterEach(() => {
  clearSearchPrefetch()
  delete host.__DS_SEARCH_PREFETCH__
  vi.useRealTimers()
})

describe('resolveSearchRequestParams', () => {
  it('query 只去除首尾空白，ori_question 额外折叠连续空白', () => {
    expect(resolveSearchRequestParams('  hello   world  ', 10)).toEqual({
      query: 'hello   world',
      count: 10,
      oriQuestion: 'hello world',
    })
  })

  it('剥离语法 token 后仍保留纯文本', () => {
    expect(resolveSearchRequestParams('site:example.com 关键词', 10)).toEqual({
      query: 'site:example.com 关键词',
      count: 10,
      oriQuestion: '关键词',
    })
  })

  it('纯语法查询的 ori_question 为空时不发送', () => {
    expect(resolveSearchRequestParams('site:example.com', 10).oriQuestion).toBeUndefined()
  })

  it('ori_question 超过长度上限时不发送', () => {
    const long = 'a'.repeat(MAX_QUERY_LENGTH + 1)
    expect(resolveSearchRequestParams(long, 10).oriQuestion).toBeUndefined()
  })

  it('结果条数收敛到 1–50，非法值回退默认值', () => {
    expect(resolveSearchRequestParams('q', 0).count).toBe(RESULT_COUNT_MIN)
    expect(resolveSearchRequestParams('q', 999).count).toBe(RESULT_COUNT_MAX)
    expect(resolveSearchRequestParams('q', Number.NaN).count).toBe(DEFAULT_SETTINGS.resultCount)
  })
})

describe('startSearchPrefetch / takeSearchPrefetch', () => {
  it('参数一致时复用预取响应且只请求一次', async () => {
    mockedSearchWeb.mockResolvedValueOnce([makeResult()])
    const params = prefetchParams()

    startSearchPrefetch(params)
    const handle = takeSearchPrefetch(params)

    expect(handle).not.toBeNull()
    await expect(handle!.promise).resolves.toEqual([makeResult()])
    expect(mockedSearchWeb).toHaveBeenCalledTimes(1)
  })

  it('预取只能被取出一次', () => {
    mockedSearchWeb.mockResolvedValueOnce([makeResult()])
    const params = prefetchParams()

    startSearchPrefetch(params)
    expect(takeSearchPrefetch(params)).not.toBeNull()
    expect(takeSearchPrefetch(params)).toBeNull()
  })

  it('重复发起相同参数时复用已有预取', () => {
    mockedSearchWeb.mockResolvedValueOnce([makeResult()])
    const params = prefetchParams()

    startSearchPrefetch(params)
    startSearchPrefetch(params)

    expect(mockedSearchWeb).toHaveBeenCalledTimes(1)
  })

  it('发起新预取时先接管并中止 head 记录', () => {
    const headAbort = vi.fn()
    host.__DS_SEARCH_PREFETCH__ = {
      query: '旧查询',
      count: 10,
      oriQuestion: '旧查询',
      apiKey: API_KEY,
      startedAt: Date.now(),
      promise: Promise.resolve({ results: [] }),
      abort: headAbort,
    }
    mockedSearchWeb.mockResolvedValueOnce([makeResult()])
    const params = prefetchParams()

    startSearchPrefetch(params)

    expect(headAbort).toHaveBeenCalledTimes(1)
    expect(host.__DS_SEARCH_PREFETCH__).toBeUndefined()
    expect(takeSearchPrefetch(params)).not.toBeNull()
  })

  it('缺少 API Key 时不发起预取', () => {
    startSearchPrefetch(prefetchParams('DeepSeek', 10, '   '))

    expect(mockedSearchWeb).not.toHaveBeenCalled()
    expect(takeSearchPrefetch(prefetchParams())).toBeNull()
  })

  it('预取失败时 resolve null，由正式请求重试', async () => {
    mockedSearchWeb.mockRejectedValueOnce(new Error('network_error'))
    const params = prefetchParams()

    startSearchPrefetch(params)
    const handle = takeSearchPrefetch(params)

    await expect(handle!.promise).resolves.toBeNull()
  })

  const mismatches: Array<[string, Partial<ReturnType<typeof prefetchParams>>]> = [
    ['query', { query: '其他查询' }],
    ['count', { count: 5 }],
    ['oriQuestion', { oriQuestion: '别的' }],
    ['apiKey', { apiKey: 'sk-other-key' }],
  ]

  for (const [label, patch] of mismatches) {
    it(`${label} 不一致时丢弃预取并中止在途请求`, () => {
      const signals: AbortSignal[] = []
      mockedSearchWeb.mockImplementationOnce((_key, params) => {
        if (params.signal) signals.push(params.signal)
        return Promise.resolve([makeResult()])
      })
      const params = prefetchParams()

      startSearchPrefetch(params)
      const handle = takeSearchPrefetch({ ...params, ...patch })

      expect(handle).toBeNull()
      expect(signals[0]?.aborted).toBe(true)
    })
  }

  it('超过保留窗口的预取被丢弃并中止', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'))
    const signals: AbortSignal[] = []
    mockedSearchWeb.mockImplementationOnce((_key, params) => {
      if (params.signal) signals.push(params.signal)
      return Promise.resolve([makeResult()])
    })
    const params = prefetchParams()

    startSearchPrefetch(params)
    vi.setSystemTime(new Date(Date.now() + PREFETCH_MAX_AGE_MS + 1))

    expect(takeSearchPrefetch(params)).toBeNull()
    expect(signals[0]?.aborted).toBe(true)
  })
})

describe('head 预取接管', () => {
  function headRecord(overrides: Record<string, unknown> = {}): Record<string, unknown> {
    return {
      query: 'DeepSeek',
      count: 10,
      oriQuestion: 'DeepSeek',
      apiKey: API_KEY,
      startedAt: Date.now(),
      promise: Promise.resolve({
        results: [{ url: 'https://api-docs.deepseek.com/', title: 'DeepSeek 官方文档' }],
      }),
      abort: () => undefined,
      ...overrides,
    }
  }

  it('接管 window 上的记录并归一化为结果', async () => {
    host.__DS_SEARCH_PREFETCH__ = headRecord()

    const handle = takeSearchPrefetch(prefetchParams())

    expect(handle).not.toBeNull()
    await expect(handle!.promise).resolves.toMatchObject([
      { url: 'https://api-docs.deepseek.com/', title: 'DeepSeek 官方文档' },
    ])
    expect(host.__DS_SEARCH_PREFETCH__).toBeUndefined()
    expect(mockedSearchWeb).not.toHaveBeenCalled()
  })

  it('记录只被接管一次', () => {
    host.__DS_SEARCH_PREFETCH__ = headRecord()

    expect(takeSearchPrefetch(prefetchParams())).not.toBeNull()
    expect(takeSearchPrefetch(prefetchParams())).toBeNull()
  })

  it('记录缺少 API Key 时忽略', () => {
    host.__DS_SEARCH_PREFETCH__ = headRecord({ apiKey: '' })

    expect(takeSearchPrefetch(prefetchParams())).toBeNull()
    expect(host.__DS_SEARCH_PREFETCH__).toBeUndefined()
  })

  it('记录与正式请求参数不一致时丢弃', () => {
    host.__DS_SEARCH_PREFETCH__ = headRecord({ query: '别的查询' })

    expect(takeSearchPrefetch(prefetchParams())).toBeNull()
  })

  it('响应体结构非法时 resolve null', async () => {
    host.__DS_SEARCH_PREFETCH__ = headRecord({ promise: Promise.resolve({ items: [] }) })

    const handle = takeSearchPrefetch(prefetchParams())

    await expect(handle!.promise).resolves.toBeNull()
  })
})

describe('awaitSearchPrefetch', () => {
  it('返回预取结果', async () => {
    const handle = { promise: Promise.resolve([makeResult()]), abort: vi.fn() }

    await expect(awaitSearchPrefetch(handle, new AbortController().signal)).resolves.toEqual([
      makeResult(),
    ])
    expect(handle.abort).not.toHaveBeenCalled()
  })

  it('已取消的正式请求不等待预取并中止它', async () => {
    const controller = new AbortController()
    const abort = vi.fn()
    controller.abort()

    const result = await awaitSearchPrefetch(
      { promise: Promise.resolve([makeResult()]), abort },
      controller.signal,
    )

    expect(result).toBeNull()
    expect(abort).toHaveBeenCalledTimes(1)
  })

  it('正式请求取消时中止在途预取', async () => {
    const controller = new AbortController()
    const abort = vi.fn()
    let release: (value: SearchResult[] | null) => void = () => undefined
    const promise = new Promise<SearchResult[] | null>((resolve) => {
      release = resolve
    })

    const waiting = awaitSearchPrefetch({ promise, abort }, controller.signal)
    controller.abort()
    release(null)

    await expect(waiting).resolves.toBeNull()
    expect(abort).toHaveBeenCalledTimes(1)
  })
})
