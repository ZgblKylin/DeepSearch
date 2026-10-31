import { flushPromises, mount } from '@vue/test-utils'
import type { VueWrapper } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import ResultsHeader from '@/components/results/ResultsHeader.vue'
import ResultsList from '@/components/results/ResultsList.vue'
import SearchBar from '@/components/search/SearchBar.vue'
import { useQueryRoute } from '@/composables/useQueryRoute'
import { useSearch } from '@/composables/useSearch'
import { searchWeb } from '@/lib/api'
import { ApiError } from '@/lib/errors'
import { clearSearchPrefetch, startSearchPrefetch } from '@/lib/searchPrefetch'
import { useSettings } from '@/stores/settings'
import { useUi } from '@/stores/ui'
import type { SearchResult } from '@/types'

/**
 * 搜索状态与结果页/搜索框回归：
 * - 无 Key 时进入 awaitingKey，关闭 Key 弹窗后显示“需要配置 API Key”而非永久骨架；
 * - 保存 Key 后自动继续被拦截的搜索；
 * - 同一 q 再次提交视为强制刷新，重新请求并替换结果，缺少 Key 时重新弹出 Key 弹窗；
 * - 预取命中时复用响应，参数不一致时回退到正式请求。
 *
 * 网络层 `@/lib/api` 的 `searchWeb` 被 mock，`normalizeSearchPayload` 保留真实实现。
 */
vi.mock('@/lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api')>()
  return { ...actual, searchWeb: vi.fn() }
})

const mockedSearchWeb = vi.mocked(searchWeb)
const settingsStore = useSettings()
const uiStore = useUi()
const searchStore = useSearch()
const route = useQueryRoute()

function makeResult(overrides: Partial<SearchResult> = {}): SearchResult {
  return {
    rerank_score: 1.2,
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

let wrapper: VueWrapper | null = null

function mountComponent(component: Parameters<typeof mount>[0], props: Record<string, unknown> = {}) {
  wrapper = mount(component, {
    props,
    global: { stubs: { teleport: true } },
    attachTo: document.body,
  }) as unknown as VueWrapper
  return wrapper
}

beforeEach(() => {
  mockedSearchWeb.mockReset()
  settingsStore.resetAll()
  uiStore.closeApiKeyModal()
  uiStore.closeErrorModal()
  uiStore.dismissToast()
  window.history.replaceState(null, '', '/')
  route.syncFromLocation()
  // 重置搜索单例（同步清空状态）
  void searchStore.run('')
  clearSearchPrefetch()
})

afterEach(() => {
  wrapper?.unmount()
  wrapper = null
  document.body.innerHTML = ''
})

describe('P2-1：无 API Key 时的可操作状态', () => {
  it('无 Key 时 run 进入 awaitingKey 并打开 Key 弹窗，不进入 loading', () => {
    void searchStore.run('DeepSeek')

    expect(searchStore.awaitingKey.value).toBe(true)
    expect(searchStore.loading.value).toBe(false)
    expect(searchStore.searched.value).toBe(false)
    expect(uiStore.apiKeyModal.open).toBe(true)
    expect(mockedSearchWeb).not.toHaveBeenCalled()
  })

  it('关闭 Key 弹窗后仍保持 awaitingKey', () => {
    void searchStore.run('DeepSeek')
    expect(uiStore.apiKeyModal.open).toBe(true)

    uiStore.closeApiKeyModal()

    expect(uiStore.apiKeyModal.open).toBe(false)
    expect(searchStore.awaitingKey.value).toBe(true)
    expect(searchStore.loading.value).toBe(false)
  })

  it('结果页显示“需要配置 API Key”状态而不是加载骨架', () => {
    void searchStore.run('DeepSeek')
    uiStore.closeApiKeyModal()

    const view = mountComponent(ResultsList)
    expect(view.text()).toContain('需要配置 API Key')
    expect(view.text()).not.toContain('正在搜索')
  })

  it('结果头部同步显示需要配置 API Key', () => {
    void searchStore.run('DeepSeek')

    const view = mountComponent(ResultsHeader)
    expect(view.text()).toContain('需要配置 API Key')
    expect(view.text()).not.toContain('等待搜索')
  })

  it('点击“配置 API Key”重新打开 Key 弹窗', async () => {
    void searchStore.run('DeepSeek')
    uiStore.closeApiKeyModal()

    const view = mountComponent(ResultsList)
    const configureButton = view
      .findAll('button')
      .find((button) => button.text().includes('配置 API Key'))
    expect(configureButton).toBeTruthy()

    await configureButton!.trigger('click')
    expect(uiStore.apiKeyModal.open).toBe(true)
  })

  it('保存 Key 后自动继续被拦截的搜索并清除 awaitingKey', async () => {
    mockedSearchWeb.mockResolvedValueOnce([makeResult()])

    void searchStore.run('DeepSeek')
    expect(searchStore.awaitingKey.value).toBe(true)

    uiStore.saveApiKey('sk-test-key')
    await flushPromises()

    expect(mockedSearchWeb).toHaveBeenCalledTimes(1)
    expect(searchStore.awaitingKey.value).toBe(false)
    expect(searchStore.loading.value).toBe(false)
    expect(searchStore.searched.value).toBe(true)
    expect(searchStore.results.value).toHaveLength(1)
    expect(searchStore.results.value[0].url).toBe('https://api-docs.deepseek.com/')
  })
})

describe('同一 q 再次提交视为强制刷新', () => {
  it('Key 未配置时同 q 提交会重新打开 Key 弹窗', async () => {
    void searchStore.run('DeepSeek')
    expect(uiStore.apiKeyModal.open).toBe(true)
    uiStore.closeApiKeyModal()
    expect(uiStore.apiKeyModal.open).toBe(false)

    route.navigate('DeepSeek')
    const view = mountComponent(SearchBar, { compact: true })
    await view.find('form').trigger('submit')

    expect(uiStore.apiKeyModal.open).toBe(true)
    expect(searchStore.awaitingKey.value).toBe(true)
    expect(mockedSearchWeb).not.toHaveBeenCalled()
  })

  it('搜索失败后同 q 提交会重新发起请求', async () => {
    settingsStore.update({ apiKey: 'sk-test-key' })
    mockedSearchWeb.mockRejectedValueOnce(
      new ApiError({ status: 500, code: 'internal_error', message: '服务端暂时不可用' }),
    )
    await searchStore.run('DeepSeek')
    expect(searchStore.error.value).not.toBeNull()
    expect(mockedSearchWeb).toHaveBeenCalledTimes(1)

    route.navigate('DeepSeek')
    mockedSearchWeb.mockResolvedValueOnce([makeResult()])
    const view = mountComponent(SearchBar, { compact: true })
    await view.find('form').trigger('submit')
    await flushPromises()

    expect(mockedSearchWeb).toHaveBeenCalledTimes(2)
    expect(searchStore.error.value).toBeNull()
    expect(searchStore.results.value).toHaveLength(1)
  })

  it('同 q 已成功时再次提交会重新请求并替换结果', async () => {
    settingsStore.update({ apiKey: 'sk-test-key' })
    mockedSearchWeb.mockResolvedValueOnce([makeResult()])
    await searchStore.run('DeepSeek')
    expect(mockedSearchWeb).toHaveBeenCalledTimes(1)

    route.navigate('DeepSeek')
    mockedSearchWeb.mockResolvedValueOnce([makeResult({ title: '刷新后的结果' })])
    const view = mountComponent(SearchBar, { compact: true })
    await view.find('form').trigger('submit')
    await flushPromises()

    expect(mockedSearchWeb).toHaveBeenCalledTimes(2)
    expect(searchStore.results.value[0]?.title).toBe('刷新后的结果')
    expect(searchStore.error.value).toBeNull()
  })

  it('强制刷新会先清空旧结果再等待新响应', async () => {
    settingsStore.update({ apiKey: 'sk-test-key' })
    mockedSearchWeb.mockResolvedValueOnce([makeResult()])
    await searchStore.run('DeepSeek')
    expect(searchStore.results.value).toHaveLength(1)

    route.navigate('DeepSeek')
    let release: (results: SearchResult[]) => void = () => undefined
    mockedSearchWeb.mockImplementationOnce(
      () =>
        new Promise<SearchResult[]>((resolve) => {
          release = resolve
        }),
    )
    const view = mountComponent(SearchBar, { compact: true })
    await view.find('form').trigger('submit')

    expect(searchStore.loading.value).toBe(true)
    expect(searchStore.results.value).toHaveLength(0)

    release([makeResult({ title: '刷新后的结果' })])
    await flushPromises()

    expect(searchStore.loading.value).toBe(false)
    expect(searchStore.results.value[0]?.title).toBe('刷新后的结果')
  })
})

describe('预取复用', () => {
  const prefetch = {
    query: 'DeepSeek',
    count: 10,
    oriQuestion: 'DeepSeek',
    apiKey: 'sk-test-key',
  }

  it('预取命中时复用响应，不重复请求', async () => {
    settingsStore.update({ apiKey: 'sk-test-key' })
    mockedSearchWeb.mockResolvedValueOnce([makeResult()])
    startSearchPrefetch(prefetch)

    await searchStore.run('DeepSeek')

    expect(mockedSearchWeb).toHaveBeenCalledTimes(1)
    expect(searchStore.results.value).toHaveLength(1)
    expect(searchStore.loading.value).toBe(false)
    expect(searchStore.searched.value).toBe(true)
  })

  it('预取参数不一致时回退到正式请求', async () => {
    settingsStore.update({ apiKey: 'sk-test-key' })
    mockedSearchWeb.mockResolvedValue([makeResult()])
    startSearchPrefetch({ ...prefetch, query: '其他查询', oriQuestion: '其他查询' })

    await searchStore.run('DeepSeek')

    // 一次被丢弃的预取 + 一次正式请求
    expect(mockedSearchWeb).toHaveBeenCalledTimes(2)
    expect(searchStore.results.value).toHaveLength(1)
  })

  it('预取失败时回退到正式请求', async () => {
    settingsStore.update({ apiKey: 'sk-test-key' })
    mockedSearchWeb
      .mockRejectedValueOnce(new Error('network_error'))
      .mockResolvedValueOnce([makeResult()])
    startSearchPrefetch(prefetch)

    await searchStore.run('DeepSeek')

    expect(mockedSearchWeb).toHaveBeenCalledTimes(2)
    expect(searchStore.results.value).toHaveLength(1)
    expect(searchStore.error.value).toBeNull()
  })
})
