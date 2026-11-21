import { describe, expect, it } from 'vitest'
import { excerpt, isReservedHelpSlug, isValidHelpSlug, stripMarkdown } from '../../src/runtime/utils'
import { moveItem } from '../../src/runtime/app/utils/checklist'

describe('plain text of a Markdown body', () => {
  it('removes marks, links, images, code and MDC fences', () => {
    const md = '# Title\n\nSome **bold** and [a link](/x) with ![alt text](/i.png).\n\n::faq{group="a"}\n::\n\n```js\ncode()\n```\n- one\n- two'
    expect(stripMarkdown(md)).toBe('Title Some bold and a link with alt text. one two')
  })

  it('cuts an excerpt at a word', () => {
    expect(excerpt('short')).toBe('short')
    const long = `${'word '.repeat(60)}end`
    const cut = excerpt(long, 40)
    expect(cut.length).toBeLessThanOrEqual(41)
    expect(cut.endsWith('…')).toBe(true)
    expect(cut.slice(0, -1).endsWith('word')).toBe(true)
  })
})

describe('slugs', () => {
  it('accepts lowercase words with dashes, and not the words a route uses', () => {
    expect(isValidHelpSlug('first-aid')).toBe(true)
    expect(isValidHelpSlug('First Aid')).toBe(false)
    expect(isValidHelpSlug('')).toBe(false)
    expect(isValidHelpSlug('a'.repeat(129))).toBe(false)
    for (const word of ['search', 'categories', 'articles', 'me', 'new', 'edit', 'admin', 'api']) {
      expect(isReservedHelpSlug(word), word).toBe(true)
      expect(isValidHelpSlug(word), word).toBe(false)
    }
  })
})

describe('moving a checklist item', () => {
  it('moves it in a copy and ignores positions that do not exist', () => {
    const list = ['a', 'b', 'c']
    expect(moveItem(list, 0, 2)).toEqual(['b', 'c', 'a'])
    expect(moveItem(list, 2, 1)).toEqual(['a', 'c', 'b'])
    expect(moveItem(list, 1, 1)).toEqual(['a', 'b', 'c'])
    expect(moveItem(list, -1, 1)).toEqual(['a', 'b', 'c'])
    expect(moveItem(list, 0, 3)).toEqual(['a', 'b', 'c'])
    expect(list).toEqual(['a', 'b', 'c'])
  })
})
