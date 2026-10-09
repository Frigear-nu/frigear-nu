import { describe, expect, it } from 'vitest'
import {
  parseInlineMarkup,
  splitGraphemes,
  typewriterPlainText,
  typewriterRuns,
} from '../app/utils/typewriter'

const runsOf = (src: string, count?: number) => typewriterRuns(parseInlineMarkup(src), count)

describe('parseInlineMarkup', () => {
  it('leaves plain text untouched', () => {
    const cells = parseInlineMarkup('Nonprofit')
    expect(typewriterPlainText(cells)).toBe('Nonprofit')
    expect(runsOf('Nonprofit')).toEqual([{ text: 'Nonprofit', class: '' }])
  })

  it('applies [text]{.classes} to every char inside the brackets', () => {
    expect(runsOf('Welcome [TO THIS]{.text-primary.font-bold}!')).toEqual([
      { text: 'Welcome ', class: '' },
      { text: 'TO THIS', class: 'text-primary font-bold' },
      { text: '!', class: '' },
    ])
  })

  it('supports space separated classes, variants and decimals', () => {
    expect(runsOf('[x]{.p-1.5 .dark:text-red .bg-primary/10}')).toEqual([
      { text: 'x', class: 'p-1.5 dark:text-red bg-primary/10' },
    ])
  })

  it('supports bold, italic and code, including nesting', () => {
    expect(runsOf('a **b *c* d** `e` _f_')).toEqual([
      { text: 'a ', class: '' },
      { text: 'b ', class: 'font-bold' },
      { text: 'c', class: 'font-bold italic' },
      { text: ' d', class: 'font-bold' },
      { text: ' ', class: '' },
      { text: 'e', class: 'font-mono' },
      { text: ' ', class: '' },
      { text: 'f', class: 'italic' },
    ])
  })

  it('never exposes markers while partially typed', () => {
    const cells = parseInlineMarkup('Bliv [frivillig]{.a}!')
    for (let n = 0; n <= cells.length; n++) {
      const text = typewriterRuns(cells, n).map(r => r.text).join('')
      expect(text).not.toMatch(/[[\]{}]/)
    }
    expect(typewriterRuns(cells, 7)).toEqual([
      { text: 'Bliv ', class: '' },
      { text: 'fr', class: 'a' },
    ])
  })

  it('keeps unmatched markers as literal text', () => {
    expect(typewriterPlainText(parseInlineMarkup('open [no attrs] and **unclosed')))
      .toBe('open [no attrs] and **unclosed')
  })

  it('honours backslash escapes', () => {
    expect(typewriterPlainText(parseInlineMarkup('\\*not italic\\*'))).toBe('*not italic*')
  })

  it('does not treat snake_case underscores as italic', () => {
    expect(typewriterPlainText(parseInlineMarkup('snake_case_name'))).toBe('snake_case_name')
  })
})

describe('splitGraphemes', () => {
  it('keeps emoji as a single grapheme', () => {
    expect(splitGraphemes('a💜b')).toEqual(['a', '💜', 'b'])
  })
})
