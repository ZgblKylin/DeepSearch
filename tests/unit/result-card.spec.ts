import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import ResultCard from '@/components/results/ResultCard.vue'
import type { SearchResult } from '@/types'

function makeResult(overrides: Partial<SearchResult> = {}): SearchResult {
  return {
    rerank_score: 2.1,
    title: 'DeepSeek 官方文档',
    url: 'https://api-docs.deepseek.com/zh-cn/',
    snippet: '示例摘要',
    summary: '示例长摘要',
    content: '',
    site_name: 'DeepSeek',
    site_icon: '',
    date: '2026-10-01T00:00:00+00:00',
    author: '',
    authority: 3,
    ...overrides,
  }
}

describe('ResultCard 站点图标', () => {
  it('优先渲染 site_icon，并保留 no-referrer 与 lazy', () => {
    const wrapper = mount(ResultCard, {
      props: {
        result: makeResult({ site_icon: 'https://cdn.deepseek.com/site-icons/deepseek.com' }),
      },
    })

    const icon = wrapper.find('img.result-card__icon')
    expect(icon.exists()).toBe(true)
    expect(icon.attributes('src')).toBe('https://cdn.deepseek.com/site-icons/deepseek.com')
    expect(icon.attributes('referrerpolicy')).toBe('no-referrer')
    expect(icon.attributes('loading')).toBe('lazy')
    expect(wrapper.find('.letter-avatar').exists()).toBe(false)
  })

  it('site_icon 为空时回退字母头像', () => {
    const wrapper = mount(ResultCard, { props: { result: makeResult() } })

    expect(wrapper.find('img.result-card__icon').exists()).toBe(false)
    expect(wrapper.find('.letter-avatar').exists()).toBe(true)
    expect(wrapper.find('.result-card__ai').text()).toContain('AI 追问')
  })

  it('site_icon 使用非 http(s) 协议时回退字母头像', () => {
    const wrapper = mount(ResultCard, {
      props: { result: makeResult({ site_icon: 'javascript:alert(1)' }) },
    })

    expect(wrapper.find('img.result-card__icon').exists()).toBe(false)
    expect(wrapper.find('.letter-avatar').exists()).toBe(true)
  })

  it('site_icon 加载失败后回退字母头像', async () => {
    const wrapper = mount(ResultCard, {
      props: { result: makeResult({ site_icon: 'https://example.com/broken.png' }) },
    })

    const icon = wrapper.find('img.result-card__icon')
    expect(icon.exists()).toBe(true)

    await icon.trigger('error')
    expect(wrapper.find('img.result-card__icon').exists()).toBe(false)
    expect(wrapper.find('.letter-avatar').exists()).toBe(true)
  })
})
