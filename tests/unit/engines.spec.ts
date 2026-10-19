import { describe, expect, it } from 'vitest'

import {
  ENGINE_LIST,
  ENGINES,
  buildEngineSearchUrl,
  encodeEngineQuery,
  getEngine,
  isEngineId,
} from '@/lib/engines'
import { ENGINE_IDS } from '@/types'

describe('ENGINES 元数据', () => {
  it('包含四个引擎且顺序与契约一致', () => {
    expect(ENGINE_LIST.map((engine) => engine.id)).toEqual([...ENGINE_IDS])
    expect(ENGINE_LIST.map((engine) => engine.name)).toEqual([
      'Bing',
      'Google',
      '百度',
      'DuckDuckGo',
    ])
  })

  it('每个引擎都有品牌色与首页', () => {
    for (const engine of ENGINE_LIST) {
      expect(engine.color).toMatch(/^#[0-9a-f]{6}$/i)
      expect(engine.homeUrl).toMatch(/^https:\/\//)
    }
  })

  it('logo 为内联 SVG 标记，不引用外部资源', () => {
    for (const engine of ENGINE_LIST) {
      expect(engine.logo.length).toBeGreaterThan(0)
      expect(engine.logo).toMatch(/<(path|circle|ellipse)/)
      expect(engine.logo).not.toMatch(/https?:/)
    }
  })

  it('getEngine 支持回退 Bing', () => {
    expect(getEngine('google').name).toBe('Google')
    // 脏数据回退（绕过类型系统验证运行时防御）
    expect(getEngine('unknown' as never).name).toBe('Bing')
  })

  it('isEngineId 只接受合法 ID', () => {
    expect(isEngineId('bing')).toBe(true)
    expect(isEngineId('baidu')).toBe(true)
    expect(isEngineId('yandex')).toBe(false)
    expect(isEngineId(null)).toBe(false)
  })
})

describe('buildEngineSearchUrl', () => {
  it('生成各引擎的搜索 URL', () => {
    expect(buildEngineSearchUrl('bing', 'DeepSeek')).toBe('https://www.bing.com/search?q=DeepSeek')
    expect(buildEngineSearchUrl('google', 'DeepSeek')).toBe(
      'https://www.google.com/search?q=DeepSeek',
    )
    expect(buildEngineSearchUrl('baidu', 'DeepSeek')).toBe('https://www.baidu.com/s?wd=DeepSeek')
    expect(buildEngineSearchUrl('duckduckgo', 'DeepSeek')).toBe(
      'https://duckduckgo.com/?q=DeepSeek',
    )
  })

  it('查询串正确编码（空格、中文、特殊字符）', () => {
    const url = buildEngineSearchUrl('bing', '深度 搜索 "v4" & more')
    expect(url).toBe(
      'https://www.bing.com/search?q=%E6%B7%B1%E5%BA%A6%20%E6%90%9C%E7%B4%A2%20%22v4%22%20%26%20more',
    )
    expect(decodeURIComponent(url.split('q=')[1])).toBe('深度 搜索 "v4" & more')
  })

  it('空查询返回引擎首页', () => {
    for (const engine of ENGINE_LIST) {
      expect(buildEngineSearchUrl(engine.id, '')).toBe(engine.homeUrl)
      expect(buildEngineSearchUrl(engine.id, '   ')).toBe(engine.homeUrl)
    }
  })

  it('encodeEngineQuery 去除首尾空白', () => {
    expect(encodeEngineQuery('  ab  ')).toBe('ab')
    expect(encodeEngineQuery('a b')).toBe('a%20b')
  })

  it('ENGINES 与 ENGINE_LIST 指向相同对象', () => {
    for (const engine of ENGINE_LIST) {
      expect(ENGINES[engine.id]).toBe(engine)
    }
  })
})
