import { describe, expect, it } from 'vitest'
import { currencyDigits, currencyOptions, fromCents, toCents } from '../../src/runtime/shared/money'

describe('money helpers', () => {
  it('knows how many minor-unit digits a currency has', () => {
    expect(currencyDigits('EUR')).toBe(2)
    expect(currencyDigits('JPY')).toBe(0)
    expect(currencyDigits('KWD')).toBe(3)
    expect(currencyDigits('not-a-currency')).toBe(2)
  })

  it('converts between minor and major units per currency', () => {
    expect(fromCents(1234, 'EUR')).toBe(12.34)
    expect(toCents(12.34, 'EUR')).toBe(1234)
    expect(fromCents(500, 'JPY')).toBe(500)
    expect(toCents(0.1 + 0.2, 'EUR')).toBe(30)
  })

  it('passes empty values through', () => {
    expect(fromCents(null)).toBeNull()
    expect(fromCents(undefined)).toBeUndefined()
    expect(toCents(null)).toBeNull()
    expect(toCents(Number.NaN)).toBeNull()
  })

  it('lists currencies with a code, symbol and name', () => {
    const options = currencyOptions('en')
    const eur = options.find(currency => currency.code === 'EUR')
    expect(eur).toMatchObject({ code: 'EUR', symbol: '€', name: 'Euro' })
    expect(options.length).toBeGreaterThan(50)
  })
})
