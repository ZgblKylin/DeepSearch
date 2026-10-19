import { describe, expect, it } from 'vitest'

import type { AiSource } from '@/types'
import { renderMarkdown } from '@/lib/markdown'

const SOURCES: AiSource[] = [
  { index: 1, title: '来源一', url: 'https://example.com/a', siteName: '示例一' },
  { index: 2, title: '来源二', url: 'https://example.com/b', siteName: '示例二' },
]

/** 把渲染结果解析成 DOM，便于断言结构而不是字符串顺序 */
function parse(html: string): DocumentFragment {
  const template = document.createElement('template')
  template.innerHTML = html
  return template.content
}

describe('markdown：基础渲染', () => {
  it('渲染标题、加粗、列表与行内代码', () => {
    const html = renderMarkdown('## 标题\n\n**加粗** 与 `代码`\n\n- 一\n- 二')
    expect(html).toContain('<h2')
    expect(html).toContain('<strong>加粗</strong>')
    expect(html).toContain('<code>代码</code>')
    expect(html).toContain('<ul>')
    expect(html).toContain('<li>一</li>')
  })

  it('空内容返回空字符串', () => {
    expect(renderMarkdown('')).toBe('')
    expect(renderMarkdown('   \n  ')).toBe('')
  })
})

describe('markdown：链接安全', () => {
  it('http/https 链接统一 target=_blank 与 noopener noreferrer', () => {
    const root = parse(renderMarkdown('[一](https://example.com/a) [二](http://example.com/b)'))
    const anchors = Array.from(root.querySelectorAll('a'))
    expect(anchors).toHaveLength(2)
    for (const anchor of anchors) {
      expect(anchor.getAttribute('target')).toBe('_blank')
      expect(anchor.getAttribute('rel')).toBe('noopener noreferrer')
      expect(anchor.getAttribute('href')).toMatch(/^https?:\/\//)
    }
  })

  it('非 http/https 链接退化为纯文本（javascript/mailto/相对链接）', () => {
    const html = renderMarkdown(
      '[危险](javascript:alert(1)) [邮件](mailto:a@b.example) [相对](/relative/path)',
    )
    expect(html).not.toContain('<a')
    expect(html).not.toContain('javascript:')
    expect(html).not.toContain('mailto:')
    expect(html).toContain('危险')
    expect(html).toContain('邮件')
    expect(html).toContain('相对')
  })

  it('原始 HTML 链接上的事件属性与 style 被清除', () => {
    const html = renderMarkdown(
      '<a href="https://example.com/x" onclick="alert(1)" style="color:red">安全</a>',
    )
    expect(html).not.toContain('onclick')
    expect(html).not.toContain('style=')
    const root = parse(html)
    const anchor = root.querySelector('a')
    expect(anchor?.getAttribute('href')).toBe('https://example.com/x')
    expect(anchor?.getAttribute('target')).toBe('_blank')
    expect(anchor?.getAttribute('rel')).toBe('noopener noreferrer')
  })
})

describe('markdown：XSS 清洗', () => {
  it('移除 script 与事件处理器', () => {
    const html = renderMarkdown('<script>alert(1)</script>\n\n<img src="x" onerror="alert(1)">')
    expect(html).not.toMatch(/<script/i)
    expect(html).not.toMatch(/<img/i)
    expect(html).not.toContain('alert(1)')
    expect(html).not.toContain('onerror')
  })

  it('移除 iframe/object/embed/style/form/input 等禁止标签', () => {
    const markdown = [
      '<iframe src="https://evil.example"></iframe>',
      '<object data="https://evil.example/x.swf"></object>',
      '<embed src="https://evil.example/x.swf">',
      '<style>body { background: red; }</style>',
      '<form action="https://evil.example"><input name="q"></form>',
      '<svg onload="alert(1)"><circle r="1" /></svg>',
      '![图片](https://evil.example/x.png)',
    ].join('\n\n')
    const html = renderMarkdown(markdown)
    expect(html).not.toMatch(/<iframe/i)
    expect(html).not.toMatch(/<object/i)
    expect(html).not.toMatch(/<embed/i)
    expect(html).not.toMatch(/<style/i)
    expect(html).not.toMatch(/<form/i)
    expect(html).not.toMatch(/<input/i)
    expect(html).not.toMatch(/<svg/i)
    expect(html).not.toMatch(/<img/i)
    expect(html).not.toContain('onload')
  })

  it('data URI 图片与协议被拒绝', () => {
    const html = renderMarkdown('![x](data:image/png;base64,AAAA)\n\n[y](data:text/html,x)')
    expect(html).not.toContain('data:image')
    expect(html).not.toContain('data:text/html')
  })
})

describe('markdown：来源引用 [n]', () => {
  it('把合法编号转换为来源 URL 上标链接', () => {
    const root = parse(renderMarkdown('结论[1]，补充[2]。', SOURCES))
    const citations = Array.from(root.querySelectorAll('sup.md-cite'))
    expect(citations).toHaveLength(2)

    const first = citations[0].querySelector('a')
    expect(first?.textContent).toBe('1')
    expect(first?.getAttribute('href')).toBe('https://example.com/a')
    expect(first?.getAttribute('target')).toBe('_blank')
    expect(first?.getAttribute('rel')).toBe('noopener noreferrer')

    const second = citations[1].querySelector('a')
    expect(second?.getAttribute('href')).toBe('https://example.com/b')
    expect(second?.textContent).toBe('2')
  })

  it('相邻引用 [1][2] 均能转换', () => {
    const root = parse(renderMarkdown('见[1][2]', SOURCES))
    expect(root.querySelectorAll('sup.md-cite')).toHaveLength(2)
  })

  it('非法编号与缺失编号保持原文', () => {
    const html = renderMarkdown('无效[9] 与 [0]', SOURCES)
    expect(html).toContain('[9]')
    expect(html).toContain('[0]')
    expect(html).not.toContain('md-cite')
  })

  it('来源 URL 不是 http(s) 时不转换', () => {
    const unsafeSources: AiSource[] = [
      { index: 1, title: '危险', url: 'javascript:alert(1)', siteName: '' },
    ]
    const html = renderMarkdown('引用[1]', unsafeSources)
    expect(html).toContain('[1]')
    expect(html).not.toContain('md-cite')
    expect(html).not.toContain('javascript:')
  })

  it('跳过 code/pre/a 内的 [n] 文本', () => {
    const codeRoot = parse(renderMarkdown('`[1]`', SOURCES))
    expect(codeRoot.querySelectorAll('sup.md-cite')).toHaveLength(0)
    expect(codeRoot.querySelector('code')?.textContent).toBe('[1]')

    const preRoot = parse(renderMarkdown('```\n[1]\n```', SOURCES))
    expect(preRoot.querySelectorAll('sup.md-cite')).toHaveLength(0)

    const linkRoot = parse(renderMarkdown('[来源[1]](https://link.example)', SOURCES))
    expect(linkRoot.querySelectorAll('sup.md-cite')).toHaveLength(0)
    expect(linkRoot.querySelector('a')?.textContent).toBe('来源[1]')
  })

  it('引用只转换正文文本，不改变代码块外的普通文本', () => {
    const html = renderMarkdown('普通 [1] 与 `[1]`', SOURCES)
    const root = parse(html)
    expect(root.querySelectorAll('sup.md-cite')).toHaveLength(1)
    expect(root.querySelector('code')?.textContent).toBe('[1]')
  })
})
