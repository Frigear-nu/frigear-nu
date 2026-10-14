import { describe, expect, it } from 'vitest'
import { MONEY_NOTICE, fieldsFromCents, fromCents, toCents } from '../src/runtime/utils/money'

describe('mcp money', () => {
  it('converts minor units to whole units by currency exponent', () => {
    expect(fromCents(5220, 'USD')).toBe(52.2)
    expect(fromCents(500, 'JPY')).toBe(500)
    expect(fromCents(1234, 'KWD')).toBe(1.234)
    expect(fromCents(null, 'USD')).toBeNull()
  })

  it('converts whole units to rounded minor units', () => {
    expect(toCents(52.2, 'USD')).toBe(5220)
    expect(toCents(0.1 + 0.2, 'USD')).toBe(30)
    expect(toCents(500, 'JPY')).toBe(500)
    expect(toCents(1.234, 'KWD')).toBe(1234)
    expect(() => toCents(Number.NaN, 'USD')).toThrow()
  })

  it('converts the named fields of a row only', () => {
    expect(fieldsFromCents({ amount: 5220, refundedAmount: 100, count: 3 }, ['amount', 'refundedAmount'], 'USD'))
      .toEqual({ amount: 52.2, refundedAmount: 1, count: 3 })
  })

  it('has a standing notice', () => {
    expect(MONEY_NOTICE).toContain('52.2')
  })
})
