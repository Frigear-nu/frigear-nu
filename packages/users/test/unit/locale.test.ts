import { describe, expect, it } from 'vitest'
import { normalizeUserLocale, userLocaleOfferKey, userLocaleToOffer } from '../../src/runtime/utils/locale'
import { localeField } from '../../src/runtime/server/schemas'

describe('normalizeUserLocale', () => {
  it('takes the app\'s i18n locales only, matched without case and spelled as the app does', () => {
    const known = ['da', 'en', 'en-GB']
    expect(normalizeUserLocale('da', known)).toBe('da')
    expect(normalizeUserLocale(' EN-gb ', known)).toBe('en-GB')
    for (const value of ['de', 'da-DK', '', '  ', null, undefined, 42]) {
      expect(normalizeUserLocale(value, known), String(value)).toBeNull()
    }
  })

  it('takes a short BCP-47 tag when the app has no i18n locales', () => {
    for (const value of ['da', 'en-GB', 'zh-Hant-TW', 'fil']) expect(normalizeUserLocale(value)).toBe(value)
    for (const value of ['english', 'e', 'en_GB', 'en-', 'a-b-c-d', `en-${'x'.repeat(20)}`, '']) {
      expect(normalizeUserLocale(value), value).toBeNull()
    }
  })
})

describe('localeField', () => {
  it('stores a valid language, clears with an empty string or null, and refuses anything else', () => {
    expect(localeField(['da', 'en']).parse('DA')).toBe('da')
    expect(localeField().parse('en-GB')).toBe('en-GB')
    expect(localeField().parse('')).toBeNull()
    expect(localeField().parse(null)).toBeNull()
    expect(localeField(['da', 'en']).safeParse('de').success).toBe(false)
    expect(localeField().safeParse('not a tag').success).toBe(false)
  })
})

describe('userLocaleToOffer', () => {
  const known = ['da', 'en']

  it('offers the saved language, as the app spells it, when the page is in another', () => {
    expect(userLocaleToOffer('da', 'en', known)).toBe('da')
    expect(userLocaleToOffer('EN', 'da', known)).toBe('en')
  })

  it('offers nothing when the page is in it, it is not one of the app\'s, or nothing is saved', () => {
    expect(userLocaleToOffer('da', 'da', known)).toBeNull()
    expect(userLocaleToOffer('da', 'DA', known)).toBeNull()
    expect(userLocaleToOffer('sv', 'da', known)).toBeNull()
    expect(userLocaleToOffer(null, 'da', known)).toBeNull()
    expect(userLocaleToOffer('da', 'en', [])).toBeNull()
    expect(userLocaleToOffer('da', '', known)).toBeNull()
  })

  it('remembers an answered offer per user and language', () => {
    expect(userLocaleOfferKey(7, 'da')).toBe('users:locale-offer:7:da')
    expect(userLocaleOfferKey(7, 'en')).not.toBe(userLocaleOfferKey(8, 'en'))
  })
})
