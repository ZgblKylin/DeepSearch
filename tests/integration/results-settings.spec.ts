import { flushPromises, mount } from '@vue/test-utils'
import type { VueWrapper } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h, nextTick } from 'vue'

import ResultsHeader from '@/components/results/ResultsHeader.vue'
import ResultsList from '@/components/results/ResultsList.vue'
import SettingsPanel from '@/components/settings/SettingsPanel.vue'
import { useSearch } from '@/composables/useSearch'
import { STORAGE_KEYS } from '@/lib/storage'
import { useSettings } from '@/stores/settings'
import { useUi } from '@/stores/ui'
import { useUsage } from '@/stores/usage'
import type { ChatUsage, SearchResult } from '@/types'

/**
 * 集成测试：搜索结果排序 / 统计显示 / 清零与清空数据。
 *
 * 通过 mock `searchWeb` 提供固定结果，不访问真实 API；其余组件、store 与
 * localStorage 行为均为真实实现。
 */
const { searchWebMock } = vi.hoisted(() => ({ searchWebMock: vi.fn() }))

vi.mock('@/lib/api', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>
  return { ...actual, searchWeb: searchWebMock }
})

const settingsStore = useSettings()
const uiStore = useUi()
const usageStore = useUsage()
const search = useSearch()

const PEAK_TIME = new Date('2026-10-19T10:00:00+08:00')

function chatUsage(hit: number, miss: number, completion: number): ChatUsage {
  return {
    promptCacheHitTokens: hit,
    promptCacheMissTokens: miss,
    completionTokens: completion,
    reasoningTokens: 0,
    totalTokens: hit + miss + completion,
  }
}

function result(overrides: Partial<SearchResult> & Pick<SearchResult, 'url' | 'title'>): SearchResult {
  return {
    rerank_score: 1,
    snippet: '',
    summary: '',
    content: '',
    site_name: '',
    site_icon: '',
    date: '',
    author: '',
    authority: null,
    ...overrides,
  }
}

const SAMPLE_RESULTS: SearchResult[] = [
  result({ url: 'https://a.example/1', title: '结果A', rerank_score: 1.2, date: '2025-01-01' }),
  result({ url: 'https://b.example/2', title: '结果B', rerank_score: 0.3, date: '2024-01-01' }),
  result({ url: 'https://c.example/3', title: '结果C', rerank_score: 2.5, date: '' }),
]

let wrapper: VueWrapper | null = null

function titleOrder(): string[] {
  return wrapper!.findAll('.result-card__title').map((item) => item.text().trim())
}

function buttons(): Element[] {
  return Array.from(document.querySelectorAll('button'))
}

function findButton(text: string): HTMLButtonElement {
  const found = buttons().find((button) => (button.textContent ?? '').replace(/\s+/g, ' ').trim() === text)
  if (!found) throw new Error(`未找到按钮：${text}`)
  return found as HTMLButtonElement
}

function buttonContaining(text: string): HTMLButtonElement {
  const found = buttons().find((button) => (button.textContent ?? '').includes(text))
  if (!found) throw new Error(`未找到包含“${text}”的按钮`)
  return found as HTMLButtonElement
}

beforeEach(() => {
  settingsStore.resetAll()
  usageStore.resetUsage()
  uiStore.closeSettings()
  uiStore.dismissToast()
  searchWebMock.mockReset()
  window.history.replaceState(null, '', '/')
})

afterEach(() => {
  wrapper?.unmount()
  wrapper = null
  document.body.innerHTML = ''
})

describe('搜索结果：条数、排序与请求契约', () => {
  it('相关度降序展示；切换“最新”立即按日期重排且不重新请求', async () => {
    settingsStore.update({ apiKey: 'sk-integration-test', resultCount: 5, sortMode: 'relevance' })
    searchWebMock.mockResolvedValue(SAMPLE_RESULTS)
    await search.run('排序测试')
    await flushPromises()

    expect(searchWebMock).toHaveBeenCalledTimes(1)
    const [keyArg, paramsArg] = searchWebMock.mock.calls[0] as [
      string,
      { query: string; count: number; signal?: AbortSignal },
    ]
    expect(keyArg).toBe('sk-integration-test')
    expect(paramsArg.query).toBe('排序测试')
    expect(paramsArg.count).toBe(5)
    expect(paramsArg.signal).toBeInstanceOf(AbortSignal)

    wrapper = mount(
      defineComponent({ setup: () => () => h('div', [h(ResultsHeader), h(ResultsList)]) }),
      { attachTo: document.body },
    )
    await nextTick()

    expect(document.body.textContent).toContain('找到 3 条结果')
    expect(titleOrder()).toEqual(['结果C', '结果A', '结果B'])

    findButton('最新').click()
    await nextTick()
    expect(titleOrder()).toEqual(['结果A', '结果B', '结果C'])
    expect(searchWebMock).toHaveBeenCalledTimes(1)
    expect(settingsStore.settings.sortMode).toBe('latest')
  })
})

describe('设置面板：统计显示与清零', () => {
  it('展示搜索 / 抓取 / Token / 费用与模型峰谷行', async () => {
    settingsStore.update({ apiKey: 'sk-keep-me' })
    usageStore.recordSearch(3)
    usageStore.recordFetch(true)
    usageStore.recordChat('deepseek-flash', chatUsage(1_000_000, 0, 0), PEAK_TIME)

    wrapper = mount(SettingsPanel, {
      global: { stubs: { teleport: true } },
      attachTo: document.body,
    })
    uiStore.openSettings()
    await nextTick()

    const text = document.body.textContent ?? ''
    expect(text).toContain('本机数据统计')
    expect(text).toContain('搜索次数')
    expect(text).toContain('抓取次数')
    expect(text).toContain('Token 总消耗')
    expect(text).toContain('预估 API 花费')
    expect(text).toContain('DeepSeek Flash')
    expect(text).toContain('1,000,000')
    expect(text).toContain('¥0.04')
    expect(text).toContain('按 2026-10 官方价格硬编码')
  })

  it('清零用量需要二次确认；取消保留、确认只清统计不动 Key', async () => {
    settingsStore.update({ apiKey: 'sk-keep-me' })
    usageStore.recordSearch(3)

    wrapper = mount(SettingsPanel, {
      global: { stubs: { teleport: true } },
      attachTo: document.body,
    })
    uiStore.openSettings()
    await nextTick()

    findButton('清零用量').click()
    await nextTick()
    expect(document.body.textContent).toContain('确定清零本机统计？')
    expect(usageStore.usage.searches).toBe(1)

    findButton('取消').click()
    await nextTick()
    expect(usageStore.usage.searches).toBe(1)

    findButton('清零用量').click()
    await nextTick()
    findButton('确认清零').click()
    await nextTick()

    expect(usageStore.usage.searches).toBe(0)
    expect(usageStore.usage.fetches).toBe(0)
    expect(usageStore.usage.models).toEqual({})
    expect(settingsStore.settings.apiKey).toBe('sk-keep-me')
  })
})

describe('设置面板：清空数据', () => {
  it('二次确认后清空 Key / 设置 / 统计，主题回 system 并返回首页', async () => {
    settingsStore.update({ apiKey: 'sk-secret', theme: 'dark', resultCount: 20 })
    usageStore.recordSearch(4)
    usageStore.recordChat('deepseek-flash', chatUsage(10, 10, 10), PEAK_TIME)
    localStorage.setItem(STORAGE_KEYS.history, JSON.stringify(['deepseek']))
    window.history.replaceState(null, '', '/?q=deepseek')

    wrapper = mount(SettingsPanel, {
      global: { stubs: { teleport: true } },
      attachTo: document.body,
    })
    uiStore.openSettings()
    await nextTick()

    findButton('清空数据').click()
    await nextTick()
    expect(document.body.textContent).toContain('确定清空全部本机数据？')
    expect(settingsStore.settings.apiKey).toBe('sk-secret')

    findButton('取消').click()
    await nextTick()
    expect(settingsStore.settings.apiKey).toBe('sk-secret')

    findButton('清空数据').click()
    await nextTick()
    findButton('确认清空').click()
    await flushPromises()

    expect(settingsStore.settings.apiKey).toBe('')
    expect(settingsStore.settings.theme).toBe('system')
    expect(settingsStore.settings.resultCount).toBe(10)
    expect(usageStore.usage.searches).toBe(0)
    expect(usageStore.usage.models).toEqual({})
    expect(localStorage.getItem(STORAGE_KEYS.history)).toBeNull()
    expect(window.location.search).toBe('')
    expect(uiStore.ui.settingsOpen).toBe(false)
    expect(uiStore.ui.toast.visible).toBe(true)
    expect(uiStore.ui.toast.message).toBe('已清空本机数据')
  })
})
