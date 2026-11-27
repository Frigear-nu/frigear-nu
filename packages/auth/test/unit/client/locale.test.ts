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
  it('switches to the saved language when the app shows another', () => {
    expect(localeToApply('en', 'da', locales)).toBe('en')
    expect(localeToApply('en-GB', 'da', locales)).toBe('en')
  })

  it('does nothing when the app shows it already or it is not a language of the app', () => {
    expect(localeToApply('en', 'en', locales)).toBeNull()
    expect(localeToApply('de', 'da', locales)).toBeNull()
    expect(localeToApply(undefined, 'da', locales)).toBeNull()
  })
})
