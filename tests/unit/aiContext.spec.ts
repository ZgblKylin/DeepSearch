import { describe, expect, it } from 'vitest'

import type { SearchResult } from '@/types'
import {
  FOLLOWUP_ITEM_MAX_CHARS,
  FOLLOWUP_SYSTEM_PROMPT,
  FOLLOWUP_TOTAL_MAX_CHARS,
  SUMMARY_ITEM_MAX_CHARS,
  SUMMARY_RESULT_LIMIT,
  SUMMARY_SYSTEM_PROMPT,
  SUMMARY_TOTAL_MAX_CHARS,
  buildAskMessages,
  buildFollowupContext,
  buildSummaryContext,
  selectFollowupResults,
  selectSummaryResults,
  sortByRerank,
  truncateText,
  type FollowupDocument,
} from '@/lib/aiContext'

/** 构造一条最小搜索结果 */
function makeResult(patch: Partial<SearchResult> & { url: string }): SearchResult {
  return {
    rerank_score: 1,
    title: `标题 ${patch.url}`,
    snippet: '',
    summary: '',
    content: '',
    site_name: '',
    site_icon: '',
    date: '',
    author: '',
    authority: null,
    ...patch,
  }
}

function makeDocument(result: SearchResult, content: string, fetchFailed = false): FollowupDocument {
  return { result, content, fetchFailed }
}

describe('aiContext：排序与选取', () => {
  it('sortByRerank 按 rerank_score 降序且同分保持原顺序', () => {
    const results = [
      makeResult({ url: 'https://a.example', rerank_score: 1 }),
      makeResult({ url: 'https://b.example', rerank_score: 3 }),
      makeResult({ url: 'https://c.example', rerank_score: 2 }),
      makeResult({ url: 'https://d.example', rerank_score: 3 }),
    ]
    const sorted = sortByRerank(results)
    expect(sorted.map((item) => item.url)).toEqual([
      'https://b.example',
      'https://d.example',
      'https://c.example',
      'https://a.example',
    ])
    // 不修改入参
    expect(results[0].url).toBe('https://a.example')
  })

  it('初始摘要最多取前 8 条', () => {
    const results = Array.from({ length: 12 }, (_, index) =>
      makeResult({ url: `https://item${index}.example`, rerank_score: 12 - index }),
    )
    const selected = selectSummaryResults(results)
    expect(selected).toHaveLength(SUMMARY_RESULT_LIMIT)
    expect(selected[0].url).toBe('https://item0.example')
  })

  it('追问最多取前 3 条唯一 URL', () => {
    const results = [
      makeResult({ url: 'https://a.example', rerank_score: 5 }),
      makeResult({ url: 'https://a.example', rerank_score: 4 }),
      makeResult({ url: 'https://b.example#section', rerank_score: 3 }),
      makeResult({ url: 'https://b.example', rerank_score: 2 }),
      makeResult({ url: 'https://c.example', rerank_score: 1 }),
      makeResult({ url: 'https://d.example', rerank_score: 0.5 }),
    ]
    const selected = selectFollowupResults(results)
    expect(selected.map((item) => item.url)).toEqual([
      'https://a.example',
      'https://b.example#section',
      'https://c.example',
    ])
  })

  it('truncateText 保证长度不超过上限并附加省略号', () => {
    expect(truncateText('abc', 3)).toBe('abc')
    expect(truncateText('abcd', 3)).toBe('ab…')
    expect(truncateText('abcd', 0)).toBe('')
  })
})

describe('aiContext：初始摘要', () => {
  const results = [
    makeResult({
      url: 'https://example.com/a',
      title: '标题 A',
      site_name: '示例站',
      date: '2025-03-02T08:00:00Z',
      summary: '摘要 A',
      snippet: '片段 A',
      rerank_score: 2,
    }),
    makeResult({
      url: 'https://example.com/b',
      title: '标题 B',
      site_name: '站点 B',
      summary: '',
      snippet: '只有片段 B',
      rerank_score: 1,
    }),
  ]

  it('系统提示包含核心约束（只依据材料、不编造、查询语言、结论先行、[n]、无思考过程、约 600 字）', () => {
    expect(SUMMARY_SYSTEM_PROMPT).toContain('只依据')
    expect(SUMMARY_SYSTEM_PROMPT).toContain('不得编造')
    expect(SUMMARY_SYSTEM_PROMPT).toContain('主要语言')
    expect(SUMMARY_SYSTEM_PROMPT).toContain('先给出结论')
    expect(SUMMARY_SYSTEM_PROMPT).toContain('[n]')
    expect(SUMMARY_SYSTEM_PROMPT).toContain('不要输出思考过程')
    expect(SUMMARY_SYSTEM_PROMPT).toContain('600 字')
  })

  it('构造 system + user 消息，材料包含标题/站点/日期/URL/摘要，来源索引从 1 开始', () => {
    const context = buildSummaryContext('示例查询', results)

    expect(context.messages).toHaveLength(2)
    expect(context.messages[0]).toEqual({
      role: 'system',
      content: SUMMARY_SYSTEM_PROMPT,
    })
    expect(context.messages[1].role).toBe('user')

    const prompt = context.messages[1].content
    expect(prompt).toContain('示例查询')
    expect(prompt).toContain('[1] 标题 A')
    expect(prompt).toContain('站点：示例站')
    expect(prompt).toContain('日期：2025-03-02')
    expect(prompt).toContain('URL：https://example.com/a')
    expect(prompt).toContain('摘要 A')
    expect(prompt).toContain('片段 A')
    // 第二条没有 summary，用 snippet 补位
    expect(prompt).toContain('[2] 标题 B')
    expect(prompt).toContain('只有片段 B')

    expect(context.sources).toEqual([
      {
        index: 1,
        title: '标题 A',
        url: 'https://example.com/a',
        siteName: '示例站',
      },
      {
        index: 2,
        title: '标题 B',
        url: 'https://example.com/b',
        siteName: '站点 B',
      },
    ])
  })

  it('单条摘要正文截断到 1200 字符，总量不超过 16000 字符', () => {
    const long = 'A'.repeat(5_000)
    const many = Array.from({ length: 8 }, (_, index) =>
      makeResult({
        url: `https://long${index}.example`,
        title: `长条目 ${index}`,
        summary: long,
        rerank_score: 10 - index,
      }),
    )
    const context = buildSummaryContext('长文本', many)
    const prompt = context.messages[1].content

    expect(prompt).toContain(`${'A'.repeat(SUMMARY_ITEM_MAX_CHARS - 1)}…`)
    expect(prompt).not.toContain('A'.repeat(SUMMARY_ITEM_MAX_CHARS))
    expect(prompt.length).toBeLessThanOrEqual(SUMMARY_TOTAL_MAX_CHARS + 500)
    expect(context.sources).toHaveLength(SUMMARY_RESULT_LIMIT)
  })

  it('空结果也给出可发送的消息，来源为空', () => {
    const context = buildSummaryContext('没有结果', [])
    expect(context.sources).toEqual([])
    expect(context.messages).toHaveLength(2)
    expect(context.messages[1].content).toContain('没有可用的搜索结果材料')
  })
})

describe('aiContext：追问上下文', () => {
  it('系统提示与背景摘要指令包含引用/不编造/不输出思考过程约束', () => {
    expect(FOLLOWUP_SYSTEM_PROMPT).toContain('只依据')
    expect(FOLLOWUP_SYSTEM_PROMPT).toContain('不得编造')
    expect(FOLLOWUP_SYSTEM_PROMPT).toContain('[n]')
    expect(FOLLOWUP_SYSTEM_PROMPT).toContain('不要输出思考过程')

    const documents = [
      makeDocument(makeResult({ url: 'https://a.example', title: 'A', summary: '摘要 A' }), '正文 A'),
    ]
    const context = buildFollowupContext('追问查询', documents)
    const prompt = context.messages[1].content
    expect(prompt).toContain('追问查询')
    expect(prompt).toContain('背景摘要')
    expect(prompt).toContain('URL：https://a.example')
    expect(prompt).toContain('网页正文')
    expect(prompt).toContain('正文 A')
  })

  it('每条网页正文截断到 6000 字符，材料总量不超过 18000 字符', () => {
    const huge = 'B'.repeat(12_000)
    const documents = ['a', 'b', 'c'].map((key) =>
      makeDocument(
        makeResult({
          url: `https://${key}.example`,
          title: key,
          summary: '搜索摘要',
          rerank_score: 1,
        }),
        huge,
      ),
    )
    const context = buildFollowupContext('长正文', documents)
    const prompt = context.messages[1].content

    expect(prompt).toContain(`${'B'.repeat(FOLLOWUP_ITEM_MAX_CHARS - 1)}…`)
    expect(prompt).not.toContain('B'.repeat(FOLLOWUP_ITEM_MAX_CHARS))
    // 材料正文（不含模板头）不超过总量上限；第 3 条因超限被整条丢弃
    expect(context.messages[1].content.length).toBeLessThanOrEqual(FOLLOWUP_TOTAL_MAX_CHARS + 500)
    expect(context.sources.length).toBeLessThanOrEqual(3)
    // 来源索引始终连续且从 1 开始
    expect(context.sources.map((source) => source.index)).toEqual(
      context.sources.map((_, index) => index + 1),
    )
  })

  it('Fetch 失败或正文为空时用搜索摘要补位，并统计补位条数', () => {
    const documents = [
      makeDocument(
        makeResult({ url: 'https://ok.example', title: 'OK', summary: '成功来源摘要' }),
        '成功抓取的正文',
      ),
      makeDocument(
        makeResult({ url: 'https://fail.example', title: 'FAIL', summary: '失败来源摘要' }),
        '',
        true,
      ),
      makeDocument(
        makeResult({ url: 'https://empty.example', title: 'EMPTY', snippet: '空正文来源片段' }),
        '   ',
      ),
    ]
    const context = buildFollowupContext('补位', documents)
    const prompt = context.messages[1].content

    expect(prompt).toContain('成功抓取的正文')
    expect(prompt).toContain('搜索摘要（网页正文读取失败，已用搜索摘要补位）')
    expect(prompt).toContain('失败来源摘要')
    expect(prompt).toContain('空正文来源片段')
    expect(context.fallbackCount).toBe(2)
    expect(context.sources).toHaveLength(3)
  })

  it('来源数组带 index/title/url/siteName，且索引与材料编号一致', () => {
    const documents = [
      makeDocument(
        makeResult({
          url: 'https://one.example',
          title: '一',
          site_name: '站点一',
        }),
        '正文一',
      ),
    ]
    const context = buildFollowupContext('来源映射', documents)
    expect(context.sources).toEqual([
      { index: 1, title: '一', url: 'https://one.example', siteName: '站点一' },
    ])
  })
})

describe('aiContext：追问历史', () => {
  it('历史只保留 role 与 content，不回传 reasoning_content', () => {
    const base = buildFollowupContext('问题', [
      makeDocument(makeResult({ url: 'https://a.example', title: 'A' }), '正文'),
    ]).messages
    const history = [
      { role: 'assistant', content: '背景摘要' },
      { role: 'user', content: '第一问' },
      { role: 'assistant', content: '第一答' },
    ] as const

    const messages = buildAskMessages(base, [...history], '第二问')

    expect(messages.slice(0, base.length)).toEqual(base)
    expect(messages.slice(base.length)).toEqual([
      { role: 'assistant', content: '背景摘要' },
      { role: 'user', content: '第一问' },
      { role: 'assistant', content: '第一答' },
      { role: 'user', content: '第二问' },
    ])
    expect(messages.some((message) => 'reasoning_content' in message)).toBe(false)
    expect(messages.some((message) => 'reasoningContent' in message)).toBe(false)
  })
})
