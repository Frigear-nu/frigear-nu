import { describe, expect, it } from 'vitest'
import { localeToApply, matchAppLocale } from '../../../src/runtime/client/app/utils/locale'

const locales = ['da', 'en']

describe('matchAppLocale', () => {
  it('matches a locale of the app, without regard to case, else by its language', () => {
    expect(matchAppLocale('en', locales)).toBe('en')
    expect(matchAppLocale('EN', locales)).toBe('en')
    expect(matchAppLocale('en-GB', locales)).toBe('en')
    expect(matchAppLocale('da_DK', locales)).toBe('da')
  })

  it('is null for a language the app does not have or no language', () => {
    expect(matchAppLocale('de', locales)).toBeNull()
    expect(matchAppLocale('', locales)).toBeNull()
    expect(matchAppLocale(undefined, locales)).toBeNull()
    expect(matchAppLocale(7, locales)).toBeNull()
  })
})

describe('localeToApply', () => {
  it('applies the saved language of a sign-in once', () => {
    expect(localeToApply('s1', 'en', locales, null)).toEqual({ locale: 'en', marker: 's1:en' })
    expect(localeToApply('s1', 'en', locales, 's1:en')).toBeNull()
  })

  it('applies again for a new sign-in or a newly saved language', () => {
    expect(localeToApply('s2', 'en', locales, 's1:en')).toEqual({ locale: 'en', marker: 's2:en' })
    expect(localeToApply('s1', 'da', locales, 's1:en')).toEqual({ locale: 'da', marker: 's1:da' })
  })

  it('does nothing signed out or without a known saved language', () => {
    expect(localeToApply(null, 'en', locales, null)).toBeNull()
    expect(localeToApply('s1', undefined, locales, null)).toBeNull()
    expect(localeToApply('s1', 'de', locales, null)).toBeNull()
  })
})
