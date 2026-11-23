import { describe, expect, it } from 'vitest'
import { currencyDigits, currencyOptions, formatMoney, fromCents, toCents } from '../../src/runtime/shared/money'

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

  it('formats minor units with no-break spaces only, never plain, thin or narrow ones', () => {
    expect(formatMoney(15000, 'DKK', 'da')).toBe('150,00\u00A0kr.')
    expect(formatMoney(1234550, 'DKK', 'da')).toBe('12.345,50\u00A0kr.')
    // French groups digits with U+202F and puts U+00A0 before the symbol.
    const french = formatMoney(123450, 'EUR', 'fr')
    expect(french).toBe('1\u00A0234,50\u00A0€')
    expect(french).not.toMatch(/[ \u2009\u202F]/)
    expect(formatMoney(150000, 'DKK', 'en')).not.toMatch(/[ \u2009\u202F]/)
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
