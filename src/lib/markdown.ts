/**
 * Markdown 渲染与安全清洗（PLAN 3.5 节）。
 *
 * 管线：marked 解析 → DOMPurify 清洗 → 链接加固 → `[n]` 引用转上标 → 输出 HTML。
 *
 * 安全约束：
 * - 禁止 `img`/`iframe`/`object`/`embed`/`style`/表单等标签（同时禁用 SVG/MathML）；
 * - 链接只允许 `http`/`https`，统一加 `target="_blank"` 与 `rel="noopener noreferrer"`，
 *   其他协议与相对链接退化为纯文本；
 * - `[n]` 只在合法来源编号与 http(s) URL 存在时转成来源上标链接，
 *   并跳过 `code`/`pre`/`a` 内的文本；
 * - 所有生成给 `v-html` 的字符串都经过上述处理，调用方不再做额外拼接。
 */

import DOMPurify, { type Config } from 'dompurify'
import { marked } from 'marked'

import type { AiSource } from '@/types'

/** 明确禁止的标签（DOMPurify 默认还会去掉 script 等危险标签） */
export const MARKDOWN_FORBIDDEN_TAGS = [
  'img',
  'picture',
  'source',
  'iframe',
  'frame',
  'frameset',
  'object',
  'embed',
  'applet',
  'style',
  'link',
  'meta',
  'base',
  'form',
  'input',
  'button',
  'textarea',
  'select',
  'option',
  'video',
  'audio',
  'canvas',
] as const

/** DOMPurify 配置：HTML profile + 禁止标签 + 禁止样式/事件类属性 */
const SANITIZE_CONFIG: Config = {
  USE_PROFILES: { html: true },
  FORBID_TAGS: [...MARKDOWN_FORBIDDEN_TAGS],
  FORBID_ATTR: ['style', 'srcset', 'formaction', 'xlink:href', 'target', 'rel'],
  ALLOW_DATA_ATTR: false,
}

/** 只允许 http/https 的绝对链接 */
function isHttpUrl(value: string): boolean {
  if (!value) return false
  try {
    const parsed = new URL(value)
    return parsed.protocol === 'http:' || parsed.protocol === 'https:'
  } catch {
    return false
  }
}

/** 给来源引用锚点加上统一的打开方式 */
function hardenAnchor(anchor: HTMLAnchorElement, href: string): void {
  anchor.setAttribute('href', href)
  anchor.setAttribute('target', '_blank')
  anchor.setAttribute('rel', 'noopener noreferrer')
}

/**
 * 加固普通链接：非 http(s) 链接去掉标签只保留文本；
 * 合法链接统一新标签页打开且禁止 opener。
 */
function hardenAnchors(root: DocumentFragment): void {
  for (const anchor of Array.from(root.querySelectorAll('a'))) {
    const href = anchor.getAttribute('href')?.trim() ?? ''
    if (!isHttpUrl(href)) {
      anchor.replaceWith(...Array.from(anchor.childNodes))
      continue
    }
    hardenAnchor(anchor, href)
  }
}

/** 文本节点是否位于不处理引用的元素内 */
function isInsideExcluded(element: Element | null): boolean {
  return element !== null && element.closest('code, pre, a') !== null
}

/**
 * 把文本节点中的 `[n]` 转为来源上标链接。
 *
 * - 只有 `sources` 中存在且 URL 为 http(s) 的编号才会转换；
 * - 支持一行内多个引用（如 `[1][3]`）；
 * - 已在 `code`/`pre`/`a` 内的文本保持原样。
 */
function replaceCitations(root: DocumentFragment, sources: readonly AiSource[]): void {
  if (sources.length === 0) return

  const urls = new Map<number, string>()
  for (const source of sources) {
    const url = source.url.trim()
    if (isHttpUrl(url)) urls.set(source.index, url)
  }
  if (urls.size === 0) return

  const doc = root.ownerDocument ?? document
  const walker = doc.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  const targets: Text[] = []
  while (walker.nextNode()) {
    const node = walker.currentNode as Text
    const text = node.nodeValue ?? ''
    if (!text.includes('[')) continue
    if (isInsideExcluded(node.parentElement)) continue
    targets.push(node)
  }

  for (const node of targets) {
    const text = node.nodeValue ?? ''
    const pattern = /\[(\d{1,3})\]/g
    let match: RegExpExecArray | null
    let lastIndex = 0
    let replaced = false
    const fragment = doc.createDocumentFragment()

    while ((match = pattern.exec(text)) !== null) {
      const url = urls.get(Number(match[1]))
      if (!url) continue
      replaced = true
      if (match.index > lastIndex) {
        fragment.append(text.slice(lastIndex, match.index))
      }
      const sup = doc.createElement('sup')
      sup.className = 'md-cite'
      const anchor = doc.createElement('a')
      hardenAnchor(anchor, url)
      anchor.textContent = match[1]
      sup.append(anchor)
      fragment.append(sup)
      lastIndex = match.index + match[0].length
    }

    if (!replaced) continue
    if (lastIndex < text.length) fragment.append(text.slice(lastIndex))
    node.replaceWith(fragment)
  }
}

/**
 * 渲染 Markdown 为可直接 `v-html` 的安全 HTML。
 *
 * @param markdown 模型输出的 Markdown 文本
 * @param sources  当前会话来源；用于把 `[n]` 转为来源链接
 */
export function renderMarkdown(markdown: string, sources: readonly AiSource[] = []): string {
  const source = typeof markdown === 'string' ? markdown : ''
  if (!source.trim()) return ''

  const rawHtml = marked.parse(source, {
    async: false,
    gfm: true,
    breaks: true,
  }) as string

  const sanitized = DOMPurify.sanitize(rawHtml, SANITIZE_CONFIG)
  if (typeof document === 'undefined') return sanitized

  const template = document.createElement('template')
  template.innerHTML = sanitized
  hardenAnchors(template.content)
  replaceCitations(template.content, sources)
  return template.innerHTML
}
