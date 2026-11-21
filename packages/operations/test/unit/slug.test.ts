import { describe, expect, it } from 'vitest'
import { RESERVED_OPERATION_SLUGS, isValidOperationSlug } from '../../src/runtime/utils'

describe('operation slugs', () => {
  it('accepts lowercase words joined by single dashes', () => {
    expect(isValidOperationSlug('summer-2030-bar')).toBe(true)
    expect(isValidOperationSlug('a')).toBe(true)
    expect(isValidOperationSlug('2027')).toBe(true)
  })

  it('rejects anything else', () => {
    for (const slug of ['', 'Summer', 'summer bar', 'summer--bar', '-summer', 'summer-', 'sum/mer', 'bar_2027', 'blå-bar']) {
      expect(isValidOperationSlug(slug), slug).toBe(false)
    }
    expect(isValidOperationSlug('a'.repeat(129))).toBe(false)
    expect(isValidOperationSlug('a'.repeat(128))).toBe(true)
  })

  it('reserves the route words, `me` first: it is the static segment of /api/operations/me', () => {
    expect(RESERVED_OPERATION_SLUGS).toContain('me')
    for (const slug of RESERVED_OPERATION_SLUGS) expect(isValidOperationSlug(slug), slug).toBe(false)
  })
})
