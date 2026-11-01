import { describe, expect, it } from 'vitest'

import { removeHtmlComments } from '../../scripts/html-comments'

describe('HTML comment removal', () => {
  it('does not reintroduce comment openers when removing comments', () => {
    const html = removeHtmlComments('<div>safe<!-<!-- nested -->-<span>content</span></div>')

    expect(html).not.toContain('<!--')
    expect(html).toContain('<span>content</span>')
  })

  it('preserves conditional comments', () => {
    const comment = '<!--[if IE]><div>legacy</div><![endif]-->'

    expect(removeHtmlComments(comment)).toBe(comment)
  })
})
