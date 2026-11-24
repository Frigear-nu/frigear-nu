import { describe, expect, it } from 'vitest'
import type { Nuxt } from '@nuxt/schema'
import { localeOfPath, matchLocale, pickLocale } from '../src/runtime/server'
import { readLocaleRouting } from '../src/runtime/utils/i18n'

const i18n = { strategy: 'prefix_except_default', defaultLocale: 'da', locales: ['da', 'en'] }

describe('matchLocale', () => {
  it('matches a code without regard to case, else its language', () => {
    expect(matchLocale('en', ['da', 'en'])).toBe('en')
    expect(matchLocale('EN', ['da', 'en'])).toBe('en')
    expect(matchLocale('en-GB', ['da', 'en'])).toBe('en')
    expect(matchLocale('da_DK', ['da', 'en'])).toBe('da')
    expect(matchLocale('en-gb', ['da', 'en-GB'])).toBe('en-GB')
  })

  it('answers null for no tag or an unknown one', () => {
    expect(matchLocale('sv', ['da', 'en'])).toBeNull()
    expect(matchLocale('', ['da', 'en'])).toBeNull()
    expect(matchLocale(undefined, ['da', 'en'])).toBeNull()
  })
})

describe('pickLocale', () => {
  it('picks the first known language of a space-separated list or an array', () => {
    expect(pickLocale('sv en-GB da', ['da', 'en'])).toBe('en')
    expect(pickLocale(['de', 'da'], ['da', 'en'])).toBe('da')
  })

  it('answers null when none is known', () => {
    expect(pickLocale('sv de', ['da', 'en'])).toBeNull()
    expect(pickLocale(undefined, ['da', 'en'])).toBeNull()
    expect(pickLocale('en', [])).toBeNull()
  })
})

describe('localeOfPath', () => {
  it('reads the locale prefix', () => {
    expect(localeOfPath('/en/dashboard', i18n)).toBe('en')
    expect(localeOfPath('/en?x=1', i18n)).toBe('en')
  })

  it('answers the default locale for an unprefixed path where unprefixed paths are in it', () => {
    expect(localeOfPath('/dashboard', i18n)).toBe('da')
    expect(localeOfPath('/', { ...i18n, strategy: 'prefix_and_default' })).toBe('da')
  })

  it('answers null when the path does not say', () => {
    expect(localeOfPath('/dashboard', { ...i18n, strategy: 'prefix' })).toBeNull()
    expect(localeOfPath('/en/dashboard', { ...i18n, strategy: 'no_prefix' })).toBeNull()
    expect(localeOfPath('/en/dashboard', null)).toBeNull()
    expect(localeOfPath('https://example.com/en', i18n)).toBeNull()
  })
})

describe('readLocaleRouting', () => {
  const nuxt = (i18nOptions: unknown) => ({ options: { i18n: i18nOptions } }) as unknown as Nuxt

  it('reads the strategy, default locale, codes and cookie', () => {
    expect(readLocaleRouting(nuxt({ defaultLocale: 'da', locales: [{ code: 'da' }, 'en'] }))).toEqual({
      strategy: 'prefix_except_default',
      defaultLocale: 'da',
      locales: ['da', 'en'],
      cookie: 'i18n_redirected',
    })
    expect(readLocaleRouting(nuxt({ strategy: 'no_prefix', locales: ['en'], detectBrowserLanguage: { cookieKey: 'lang' } }))?.cookie).toBe('lang')
  })

  it('has no cookie when browser language detection or its cookie is off', () => {
    expect(readLocaleRouting(nuxt({ locales: ['en'], detectBrowserLanguage: false }))?.cookie).toBeNull()
    expect(readLocaleRouting(nuxt({ locales: ['en'], detectBrowserLanguage: { useCookie: false } }))?.cookie).toBeNull()
  })

  it('is null without i18n locales', () => {
    expect(readLocaleRouting(nuxt(undefined))).toBeNull()
    expect(readLocaleRouting(nuxt({ locales: [] }))).toBeNull()
  })
})
