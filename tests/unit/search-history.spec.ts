import { beforeEach, describe, expect, it } from 'vitest'

import { MAX_SEARCH_HISTORY, addSearchHistory, clearSearchHistory, readSearchHistory } from '@/lib/searchHistory'
import { STORAGE_KEYS } from '@/lib/storage'

describe('搜索历史', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('初始为空', () => {
    expect(readSearchHistory()).toEqual([])
  })

  it('提交后保存，并按最近使用排序', () => {
    addSearchHistory('DeepSeek')
    addSearchHistory('V4.1 Flash')
    addSearchHistory('DeepSeek')

    expect(readSearchHistory()).toEqual(['DeepSeek', 'V4.1 Flash'])
  })

  it('忽略空值并截断到上限', () => {
    expect(addSearchHistory('   ')).toEqual([])

    for (let index = 0; index < MAX_SEARCH_HISTORY + 3; index += 1) {
      addSearchHistory(`关键词 ${index}`)
    }

    const history = readSearchHistory()
    expect(history).toHaveLength(MAX_SEARCH_HISTORY)
    expect(history[0]).toBe(`关键词 ${MAX_SEARCH_HISTORY + 2}`)
  })

  it('读取时过滤非法项与重复项', () => {
    localStorage.setItem(
      STORAGE_KEYS.history,
      JSON.stringify(['合法', 42, '', '合法', ' 另一条  ', null]),
    )

    expect(readSearchHistory()).toEqual(['合法', '另一条'])
  })

  it('可以清空历史', () => {
    addSearchHistory('DeepSeek')
    clearSearchHistory()

    expect(readSearchHistory()).toEqual([])
    expect(localStorage.getItem(STORAGE_KEYS.history)).toBeNull()
  })
})
