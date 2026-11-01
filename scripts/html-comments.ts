/**
 * 删除 HTML 注释，保留 IE 条件注释。
 *
 * 用空格而非空串替换：删除点两侧的 `<!-` 与 `-` 若直接相邻，会重拼出 `<!--` 起始标记。
 * 空格阻断这种拼接；后续 HTML 压缩会归一化标签之间的多余空白。
 */
export function removeHtmlComments(html: string): string {
  return html.replace(/<!--(?!\[if)[\s\S]*?-->/g, ' ')
}
