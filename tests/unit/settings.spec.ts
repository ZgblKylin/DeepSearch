import { describe, expect, it } from 'vitest'

import { DEFAULT_SETTINGS } from '@/types'
import { normalizeSettings } from '@/stores/settings'

describe('normalizeSettings', () => {
  it('空值回退默认设置', () => {
    expect(normalizeSettings(null)).toEqual(DEFAULT_SETTINGS)
    expect(normalizeSettings(undefined)).toEqual(DEFAULT_SETTINGS)
    expect(normalizeSettings('broken')).toEqual(DEFAULT_SETTINGS)
  })

  it('合并合法字段、丢弃非法字段并收敛条数范围', () => {
    const settings = normalizeSettings({
      apiKey: '  test-key  ',
      resultCount: 500,
      sortMode: 'bogus',
      theme: 'dark',
      aiMode: false,
    })

    expect(settings.apiKey).toBe('test-key')
    expect(settings.resultCount).toBe(50)
    expect(settings.sortMode).toBe('relevance')
    expect(settings.theme).toBe('dark')
    expect(settings.aiMode).toBe(false)
    expect(settings.aiModel).toBe(DEFAULT_SETTINGS.aiModel)
  })

  it('条数向下取整且不小于 1', () => {
    expect(normalizeSettings({ resultCount: 0 }).resultCount).toBe(1)
    expect(normalizeSettings({ resultCount: 3.6 }).resultCount).toBe(4)
  })

  it('归一化历史模型别名', () => {
    expect(normalizeSettings({ aiModel: 'deepseek-v4-flash' }).aiModel).toBe('deepseek-flash')
  })
})
