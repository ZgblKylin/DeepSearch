import { describe, expect, it } from 'vitest'

import {
  MAX_QUERY_LENGTH,
  clearFilterGroup,
  clearQueryFilters,
  countActiveFilters,
  countQueryChars,
  createEmptyFilters,
  extractOriQuestion,
  hasActiveFilters,
  isDateRangeValid,
  isQueryLengthValid,
  normalizeDateValue,
  normalizeFilters,
  normalizeSite,
  parseQuery,
  serializeQuery,
  updateQueryFilters,
  validateQuery,
} from '@/lib/query'

describe('normalizeSite', () => {
  it('去掉协议、路径、查询串与端口，只保留 host', () => {
    expect(normalizeSite('https://www.example.com/path?q=1#top')).toBe('www.example.com')
    expect(normalizeSite('http://example.com:8080/a/b')).toBe('example.com')
    expect(normalizeSite('example.com/path?x=1')).toBe('example.com')
    expect(normalizeSite('  EXAMPLE.com  ')).toBe('example.com')
    expect(normalizeSite('https://example.com.')).toBe('example.com')
    expect(normalizeSite('site:"example.com"')).toBe('')
  })

  it('无法识别为 host 时返回空串', () => {
    expect(normalizeSite('')).toBe('')
    expect(normalizeSite('http://')).toBe('')
    expect(normalizeSite('not a site')).toBe('')
    expect(normalizeSite('localhost')).toBe('')
  })

  it('接受 IPv4', () => {
    expect(normalizeSite('http://192.168.1.10:8080/x')).toBe('192.168.1.10')
  })
})

describe('normalizeDateValue', () => {
  it('仅年份归一化为区间端点', () => {
    expect(normalizeDateValue('2024', 'after')).toBe('2024-01-01')
    expect(normalizeDateValue('2024', 'before')).toBe('2024-12-31')
  })

  it('完整日期原样保留', () => {
    expect(normalizeDateValue('2024-05-06', 'after')).toBe('2024-05-06')
    expect(normalizeDateValue('2024-05-06', 'before')).toBe('2024-05-06')
  })

  it('非法日期返回 null', () => {
    expect(normalizeDateValue('2024-13-01', 'after')).toBeNull()
    expect(normalizeDateValue('2024-02-30', 'after')).toBeNull()
    expect(normalizeDateValue('2024/01/01', 'after')).toBeNull()
    expect(normalizeDateValue('24', 'after')).toBeNull()
    expect(normalizeDateValue('', 'after')).toBeNull()
  })
})

describe('parseQuery：基础文本', () => {
  it('纯文本全部进入 oriQuestion', () => {
    const parsed = parseQuery('DeepSeek 深度求索')
    expect(parsed.filters).toEqual(createEmptyFilters())
    expect(parsed.oriQuestion).toBe('DeepSeek 深度求索')
    expect(parsed.unknownTokens).toEqual([])
  })

  it('折叠连续空白', () => {
    expect(parseQuery('  DeepSeek   V4  ').oriQuestion).toBe('DeepSeek V4')
  })

  it('空查询返回空结构', () => {
    const parsed = parseQuery('   ')
    expect(parsed.filters).toEqual(createEmptyFilters())
    expect(parsed.oriQuestion).toBe('')
  })

  it('extractOriQuestion 与 parseQuery 一致', () => {
    expect(extractOriQuestion('DeepSeek site:github.com lang:zh')).toBe('DeepSeek')
  })
})

describe('parseQuery：站点语法', () => {
  it('解析单个 site 并归一化 host', () => {
    const parsed = parseQuery('DeepSeek site:https://github.com/deepseek-ai?tab=code')
    expect(parsed.filters.sites).toEqual(['github.com'])
    expect(parsed.oriQuestion).toBe('DeepSeek')
  })

  it('解析 site:a OR site:b 为多个站点', () => {
    const parsed = parseQuery('site:a.com OR site:b.com')
    expect(parsed.filters.sites).toEqual(['a.com', 'b.com'])
    expect(parsed.oriQuestion).toBe('')
  })

  it('解析多个 site token（无 OR）', () => {
    const parsed = parseQuery('site:a.com site:b.com DeepSeek')
    expect(parsed.filters.sites).toEqual(['a.com', 'b.com'])
    expect(parsed.oriQuestion).toBe('DeepSeek')
  })

  it('站点去重且大小写不敏感', () => {
    const parsed = parseQuery('site:A.com site:a.com')
    expect(parsed.filters.sites).toEqual(['a.com'])
  })

  it('解析 -site 排除站点', () => {
    const parsed = parseQuery('DeepSeek -site:spam.com -site:https://ads.example.org/x')
    expect(parsed.filters.excludedSites).toEqual(['spam.com', 'ads.example.org'])
    expect(parsed.oriQuestion).toBe('DeepSeek')
  })

  it('OR 后不是 site 时保留为纯文本', () => {
    const parsed = parseQuery('site:a.com OR hello')
    expect(parsed.filters.sites).toEqual(['a.com'])
    expect(parsed.oriQuestion).toBe('OR hello')
  })

  it('malformed site token 原样保留', () => {
    const parsed = parseQuery('DeepSeek site: site:not_a_host')
    expect(parsed.filters.sites).toEqual([])
    expect(parsed.unknownTokens).toEqual(['site:', 'site:not_a_host'])
    expect(parsed.oriQuestion).toBe('DeepSeek site: site:not_a_host')
  })
})

describe('parseQuery：短语与排除词', () => {
  it('解析精确短语', () => {
    const parsed = parseQuery('"machine learning" 教程')
    expect(parsed.filters.phrases).toEqual(['machine learning'])
    expect(parsed.oriQuestion).toBe('教程')
  })

  it('解析 -word 与 -"短语"', () => {
    const parsed = parseQuery('-广告 -"machine learning" DeepSeek')
    expect(parsed.filters.excludedWords).toEqual(['广告', 'machine learning'])
    expect(parsed.oriQuestion).toBe('DeepSeek')
  })

  it('排除词去重且大小写不敏感', () => {
    const parsed = parseQuery('-ads -ADS')
    expect(parsed.filters.excludedWords).toEqual(['ads'])
  })

  it('空引号与空排除词按 malformed 保留', () => {
    const parsed = parseQuery('"" -')
    expect(parsed.filters.phrases).toEqual([])
    expect(parsed.filters.excludedWords).toEqual([])
    expect(parsed.unknownTokens).toEqual(['""', '-'])
    expect(parsed.oriQuestion).toBe('"" -')
  })

  it('未闭合引号整体保留为 malformed token', () => {
    const parsed = parseQuery('DeepSeek "machine learning')
    expect(parsed.unknownTokens).toEqual(['"machine learning'])
    expect(parsed.oriQuestion).toBe('DeepSeek "machine learning')
    expect(parsed.filters.phrases).toEqual([])
  })
})

describe('parseQuery：语言与日期', () => {
  it('解析单 token 多语言并转小写', () => {
    const parsed = parseQuery('DeepSeek lang:ZH,en')
    expect(parsed.filters.langs).toEqual(['zh', 'en'])
    expect(parsed.oriQuestion).toBe('DeepSeek')
  })

  it('解析多个 lang token 并合并', () => {
    const parsed = parseQuery('lang:zh lang:ja')
    expect(parsed.filters.langs).toEqual(['zh', 'ja'])
  })

  it('非法语言保留为 malformed token', () => {
    const parsed = parseQuery('lang:zzzzzz lang:')
    expect(parsed.filters.langs).toEqual([])
    expect(parsed.unknownTokens).toEqual(['lang:zzzzzz', 'lang:'])
    expect(parsed.oriQuestion).toBe('lang:zzzzzz lang:')
  })

  it('after/before 仅年份归一化', () => {
    const parsed = parseQuery('DeepSeek after:2024 before:2025')
    expect(parsed.filters.after).toBe('2024-01-01')
    expect(parsed.filters.before).toBe('2025-12-31')
    expect(parsed.oriQuestion).toBe('DeepSeek')
  })

  it('完整日期原样保留，后出现的覆盖先出现的', () => {
    const parsed = parseQuery('after:2024-03-04 after:2024-05-06')
    expect(parsed.filters.after).toBe('2024-05-06')
  })

  it('非法日期保留为 malformed token', () => {
    const parsed = parseQuery('after:2024-13-01 before:2024-02-30')
    expect(parsed.filters.after).toBeNull()
    expect(parsed.filters.before).toBeNull()
    expect(parsed.unknownTokens).toEqual(['after:2024-13-01', 'before:2024-02-30'])
  })
})

describe('parseQuery：混合语序与保留 token', () => {
  it('语法 token 可出现在任意位置，oriQuestion 保持文本顺序', () => {
    const parsed = parseQuery('"foo bar" 深度 site:github.com -广告 lang:zh after:2024 求索')
    expect(parsed.filters).toEqual({
      sites: ['github.com'],
      excludedSites: [],
      phrases: ['foo bar'],
      excludedWords: ['广告'],
      langs: ['zh'],
      after: '2024-01-01',
      before: null,
    })
    expect(parsed.oriQuestion).toBe('深度 求索')
  })

  it('未知前缀保持为纯文本而非语法', () => {
    const parsed = parseQuery('title:DeepSeek DeepSeek')
    expect(parsed.filters).toEqual(createEmptyFilters())
    expect(parsed.oriQuestion).toBe('title:DeepSeek DeepSeek')
  })

  it('解析大小写不敏感的语法关键字', () => {
    const parsed = parseQuery('SITE:Example.com LANG:ZH AFTER:2024 -Site:spam.com -WORD')
    expect(parsed.filters.sites).toEqual(['example.com'])
    expect(parsed.filters.excludedSites).toEqual(['spam.com'])
    expect(parsed.filters.langs).toEqual(['zh'])
    expect(parsed.filters.after).toBe('2024-01-01')
    expect(parsed.filters.excludedWords).toEqual(['WORD'])
  })
})

describe('serializeQuery', () => {
  it('序列化全部筛选项与正文', () => {
    const query = serializeQuery(
      {
        sites: ['a.com', 'b.com'],
        excludedSites: ['spam.com'],
        phrases: ['machine learning'],
        excludedWords: ['广告', 'big data'],
        langs: ['zh', 'en'],
        after: '2024-01-01',
        before: '2025-12-31',
      },
      'DeepSeek 教程',
    )
    expect(query).toBe(
      '"machine learning" site:a.com OR site:b.com -site:spam.com -广告 -"big data" lang:zh,en after:2024-01-01 before:2025-12-31 DeepSeek 教程',
    )
  })

  it('空筛选项仅输出正文', () => {
    expect(serializeQuery(createEmptyFilters(), '  DeepSeek   V4 ')).toBe('DeepSeek V4')
    expect(serializeQuery(null, '')).toBe('')
  })

  it('序列化会归一化站点与日期', () => {
    const query = serializeQuery({ sites: ['https://Example.com/a'], after: '2024', before: '2024' }, '')
    expect(query).toBe('site:example.com after:2024-01-01 before:2024-12-31')
  })

  it('往返解析保持筛选项稳定', () => {
    const filters = normalizeFilters({
      sites: ['a.com', 'b.com'],
      excludedSites: ['c.com'],
      phrases: ['hello world'],
      excludedWords: ['foo', 'bar baz'],
      langs: ['zh', 'en'],
      after: '2024-01-01',
      before: '2025-12-31',
    })
    const query = serializeQuery(filters, '深度 搜索')
    const parsed = parseQuery(query)
    expect(parsed.filters).toEqual(filters)
    expect(parsed.oriQuestion).toBe('深度 搜索')
    expect(parsed.unknownTokens).toEqual([])
  })

  it('短语与排除词中的双引号被替换为空格', () => {
    expect(serializeQuery({ phrases: ['say "hi"'], excludedWords: ['a "b" c'] }, '')).toBe(
      '"say hi" -"a b c"',
    )
  })
})

describe('改写查询', () => {
  const raw = 'DeepSeek site:github.com "machine learning" lang:zh after:2024'

  it('updateQueryFilters 只替换指定分组并保留正文', () => {
    const next = updateQueryFilters(raw, { sites: ['example.com'] })
    expect(next).toBe('"machine learning" site:example.com lang:zh after:2024-01-01 DeepSeek')
    expect(parseQuery(next).oriQuestion).toBe('DeepSeek')
  })

  it('updateQueryFilters 支持清除日期分组', () => {
    const next = updateQueryFilters(raw, { after: null })
    expect(parseQuery(next).filters.after).toBeNull()
  })

  it('clearFilterGroup 清除单个分组', () => {
    const noSites = clearFilterGroup(raw, 'sites')
    expect(parseQuery(noSites).filters.sites).toEqual([])
    expect(parseQuery(noSites).filters.phrases).toEqual(['machine learning'])
    expect(parseQuery(noSites).oriQuestion).toBe('DeepSeek')

    const noDate = clearFilterGroup(raw, 'date')
    expect(parseQuery(noDate).filters.after).toBeNull()
  })

  it('clearQueryFilters 仅保留正文', () => {
    expect(clearQueryFilters(raw)).toBe('DeepSeek')
    expect(clearQueryFilters('site:a.com')).toBe('')
  })

  it('改写保留 malformed token', () => {
    const next = updateQueryFilters('DeepSeek site: "foo bar', { sites: ['a.com'] })
    expect(next).toBe('site:a.com DeepSeek site: "foo bar')
  })
})

describe('筛选项计数', () => {
  it('hasActiveFilters 与 countActiveFilters', () => {
    expect(hasActiveFilters(createEmptyFilters())).toBe(false)
    expect(countActiveFilters(createEmptyFilters())).toBe(0)

    const filters = {
      ...createEmptyFilters(),
      sites: ['a.com'],
      langs: ['zh', 'en'],
      after: '2024-01-01',
    }
    expect(hasActiveFilters(filters)).toBe(true)
    expect(countActiveFilters(filters)).toBe(4)
  })
})

describe('查询校验', () => {
  it('空查询不可提交', () => {
    const result = validateQuery('   ')
    expect(result.valid).toBe(false)
    expect(result.empty).toBe(true)
    expect(result.tooLong).toBe(false)
    expect(result.message).toBe('请输入搜索内容')
  })

  it('128 个 Unicode 字符为边界', () => {
    const max = 'a'.repeat(MAX_QUERY_LENGTH)
    expect(validateQuery(max)).toMatchObject({ valid: true, tooLong: false, length: 128 })
    expect(isQueryLengthValid(max)).toBe(true)

    const over = 'a'.repeat(MAX_QUERY_LENGTH + 1)
    const result = validateQuery(over)
    expect(result.valid).toBe(false)
    expect(result.tooLong).toBe(true)
    expect(result.length).toBe(129)
    expect(result.message).toContain('128')
    expect(isQueryLengthValid(over)).toBe(false)
  })

  it('emoji 按码点计数（代理对算 1 个字符）', () => {
    const emoji = '😀'.repeat(MAX_QUERY_LENGTH)
    expect(countQueryChars(emoji)).toBe(128)
    expect(validateQuery(emoji).valid).toBe(true)
    expect(validateQuery(`${emoji}😀`).tooLong).toBe(true)
  })

  it('忽略首尾空白后计数', () => {
    expect(countQueryChars('   abc   ')).toBe(3)
    expect(validateQuery(`  ${'b'.repeat(129)}  `).tooLong).toBe(true)
  })
})

describe('日期区间校验', () => {
  it('开始日期不晚于结束日期时合法', () => {
    expect(isDateRangeValid('2024-01-01', '2024-12-31')).toBe(true)
    expect(isDateRangeValid('2024-01-01', '2024-01-01')).toBe(true)
    expect(isDateRangeValid(null, '2024-12-31')).toBe(true)
    expect(isDateRangeValid('2024-01-01', null)).toBe(true)
  })

  it('开始日期晚于结束日期时冲突', () => {
    expect(isDateRangeValid('2025-01-01', '2024-12-31')).toBe(false)
  })
})
