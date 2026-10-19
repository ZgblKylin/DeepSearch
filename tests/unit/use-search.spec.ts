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
import { useSettings } from '@/stores/settings'
import { useUi } from '@/stores/ui'
import type { SearchResult } from '@/types'

/**
 * 搜索状态与结果页/搜索框回归（QA P2-1 / P3-5）：
 * - 无 Key 时进入 awaitingKey，关闭 Key 弹窗后显示“需要配置 API Key”而非永久骨架；
 * - 保存 Key 后自动继续被拦截的搜索；
 * - 同一 q 在错误 / 未配置 Key 状态下再次提交会重试（重新请求或重新弹 Key 弹窗）。
 *
 * 网络层 `@/lib/api` 被 mock，不发起真实请求。
 */
vi.mock('@/lib/api', () => ({ searchWeb: vi.fn() }))

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

describe('P3-5：同一 q 再次提交的重试行为', () => {
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

  it('同 q 已成功时再次提交不会重复请求', async () => {
    settingsStore.update({ apiKey: 'sk-test-key' })
    mockedSearchWeb.mockResolvedValueOnce([makeResult()])
    await searchStore.run('DeepSeek')
    expect(mockedSearchWeb).toHaveBeenCalledTimes(1)

    route.navigate('DeepSeek')
    const view = mountComponent(SearchBar, { compact: true })
    await view.find('form').trigger('submit')
    await flushPromises()

    expect(mockedSearchWeb).toHaveBeenCalledTimes(1)
    expect(searchStore.error.value).toBeNull()
  })
})
