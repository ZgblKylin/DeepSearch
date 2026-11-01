import { describe, expect, it } from 'vitest'

import { removeHtmlComments } from '../../scripts/html-comments'

describe('removeHtmlComments', () => {
  it('删除普通注释，并以空格分隔两侧文本', () => {
    expect(removeHtmlComments('<p>a<!-- x -->b</p>')).toBe('<p>a b</p>')
  })

  it('删除注释后不会重拼出注释起始标记', () => {
    expect(removeHtmlComments('<div>safe<!-<!-- nested -->-<span>content</span></div>')).toBe(
      '<div>safe<!- -<span>content</span></div>',
    )
  })

  it('保留条件注释', () => {
    const comment = '<!--[if IE]><div>legacy</div><![endif]-->'

    expect(removeHtmlComments(comment)).toBe(comment)
  })
})
