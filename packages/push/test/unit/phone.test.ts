import { describe, expect, it } from 'vitest'
import { normalizePhone, phoneColumnOf } from '../../src/runtime/utils/phone'

// `pushUserPhone` reads `users.phone` through these: an app without the column has no SMS, nothing throws.
describe('the optional users.phone column', () => {
  it('is absent from a users table without it', () => {
    expect(phoneColumnOf({ id: {}, email: {} })).toBeUndefined()
    expect(phoneColumnOf({ phone: null })).toBeUndefined()
  })

  it('is found when the host added it', () => {
    const column = { name: 'phone' }
    expect(phoneColumnOf({ id: {}, phone: column })).toBe(column)
  })

  it('only accepts a non-empty string as a number', () => {
    expect([' +4511223344 ', '', '   ', null, undefined, 4511223344].map(normalizePhone)).toEqual(['+4511223344', null, null, null, null, null])
  })
})
