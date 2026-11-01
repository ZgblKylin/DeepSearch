export function removeHtmlComments(html: string): string {
  return html.replace(/<!--(?!\[if)[\s\S]*?-->/g, ' ')
}
