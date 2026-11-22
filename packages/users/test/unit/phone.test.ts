import { describe, expect, it } from 'vitest'
import { parseUserPhone } from '../../src/runtime/server/utils/user-phone'
import { phoneField } from '../../src/runtime/server/schemas'

describe('parseUserPhone', () => {
  it('keeps a trimmed number of digits, spaces and +-().', () => {
    expect(parseUserPhone('  +45 (12) 34-56.78 ')).toBe('+45 (12) 34-56.78')
    expect(parseUserPhone('1'.repeat(40))).toBe('1'.repeat(40))
  })

  it('answers null for anything the users routes refuse, and for empty or non-string input', () => {
    for (const value of ['1'.repeat(41), '555+0100', 'call me', '12', '', '   ', null, undefined, 4512345678]) {
      expect(parseUserPhone(value), String(value)).toBeNull()
    }
  })

  it('follows the same rule as the routes\' phoneField', () => {
    for (const value of ['+45 12 34 56 78', '1'.repeat(41), '555+0100', 'call me', '12']) {
      const parsed = phoneField().safeParse(value)
      expect(parsed.success ? parsed.data : null, value).toBe(parseUserPhone(value))
    }
  })
})
