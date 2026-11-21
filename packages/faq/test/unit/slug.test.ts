import { describe, expect, it } from 'vitest'
import { RESERVED_FAQ_SLUGS, isValidFaqSlug } from '../../src/runtime/utils'

describe('FAQ group slugs', () => {
  it('accepts lowercase words joined by single dashes', () => {
    expect(isValidFaqSlug('volunteering')).toBe(true)
    expect(isValidFaqSlug('summer-2030-bar')).toBe(true)
  })

  it('rejects anything else', () => {
    for (const slug of ['', 'Volunteering', 'a b', 'a--b', '-a', 'a-', 'a/b', 'blå']) {
      expect(isValidFaqSlug(slug), slug).toBe(false)
    }
    expect(isValidFaqSlug('a'.repeat(129))).toBe(false)
  })

  it('reserves the route words', () => {
    for (const word of ['search', 'groups', 'items', 'new', 'edit', 'admin', 'api']) {
      expect(RESERVED_FAQ_SLUGS).toContain(word)
      expect(isValidFaqSlug(word), word).toBe(false)
    }
  })
})
