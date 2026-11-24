import { describe, expect, it } from 'vitest'
import { parseFrigearLocaleClaim, pickFrigearUiLocale } from '../../src/runtime/server/utils/frigear-locale'

const i18n = { strategy: 'prefix_except_default', defaultLocale: 'da', locales: ['da', 'en'], cookie: null }

describe('pickFrigearUiLocale', () => {
  it('takes the locale of the page the login started on first', () => {
    expect(pickFrigearUiLocale({ page: '/en/auth/login', redirect: '/dashboard', cookie: 'da' }, i18n)).toBe('en')
    // An unprefixed page is in the default locale.
    expect(pickFrigearUiLocale({ page: '/auth/login', redirect: '/en/dashboard' }, i18n)).toBe('da')
  })

  it('falls back to the redirect target, then to i18n\'s cookie', () => {
    expect(pickFrigearUiLocale({ redirect: '/en/dashboard' }, i18n)).toBe('en')
    expect(pickFrigearUiLocale({ page: '/en', redirect: undefined }, { ...i18n, strategy: 'no_prefix' })).toBeUndefined()
    expect(pickFrigearUiLocale({ page: '/auth/login', cookie: 'en' }, { ...i18n, strategy: 'no_prefix' })).toBe('en')
  })

  it('ignores what is not a path on this site', () => {
    expect(pickFrigearUiLocale({ redirect: '//evil.example/en' }, i18n)).toBeUndefined()
    expect(pickFrigearUiLocale({ redirect: 42 }, i18n)).toBeUndefined()
  })

  it('sends nothing without i18n or when nothing says', () => {
    expect(pickFrigearUiLocale({ page: '/en/auth/login' }, null)).toBeUndefined()
    expect(pickFrigearUiLocale({}, i18n)).toBeUndefined()
    expect(pickFrigearUiLocale({ cookie: 'sv' }, i18n)).toBeUndefined()
  })
})

describe('parseFrigearLocaleClaim', () => {
  it('answers one of the app\'s locales', () => {
    expect(parseFrigearLocaleClaim('en', ['da', 'en'])).toBe('en')
    expect(parseFrigearLocaleClaim('DA-dk', ['da', 'en'])).toBe('da')
  })

  it('ignores anything else', () => {
    expect(parseFrigearLocaleClaim('sv', ['da', 'en'])).toBeUndefined()
    expect(parseFrigearLocaleClaim('en', [])).toBeUndefined()
    expect(parseFrigearLocaleClaim(1, ['en'])).toBeUndefined()
  })
})
