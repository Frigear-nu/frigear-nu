import { describe, expect, it } from 'vitest'
import { PROFILE_NO_LOCALE, profileChanges } from '../../src/runtime/app/utils/profile'

const values = { name: 'Ada', avatar: '', phone: '', locale: PROFILE_NO_LOCALE }

describe('profileChanges (the profile form\'s PATCH body)', () => {
  it('sends the phone number, and null to clear it or the avatar', () => {
    expect(profileChanges({ ...values, phone: '+45 12 34 56 78' }, values, { localeChoice: true }))
      .toEqual({ name: 'Ada', avatar: null, phone: '+45 12 34 56 78' })
    expect(profileChanges({ ...values, avatar: 'https://example.com/a.png' }, values, { localeChoice: true }))
      .toEqual({ name: 'Ada', avatar: 'https://example.com/a.png', phone: null })
  })

  it('sends the language only when it changed, and null for "not set"', () => {
    expect(profileChanges({ ...values, locale: 'da' }, values, { localeChoice: true })).toMatchObject({ locale: 'da' })
    expect(profileChanges({ ...values, locale: PROFILE_NO_LOCALE }, { locale: 'da' }, { localeChoice: true })).toMatchObject({ locale: null })
    expect(profileChanges({ ...values, locale: 'da' }, { locale: 'da' }, { localeChoice: true })).not.toHaveProperty('locale')
  })

  it('leaves a stored language the app does not offer alone, so the rest still saves', () => {
    // `de` was stored while the app had no i18n; the server only accepts the app's locales now.
    const body = profileChanges({ ...values, name: 'Ada L.', locale: 'de' }, { locale: 'de' }, { localeChoice: true })
    expect(body).toEqual({ name: 'Ada L.', avatar: null, phone: null })
  })

  it('never sends a language without i18n (no choice offered)', () => {
    expect(profileChanges({ ...values, locale: 'da' }, values, { localeChoice: false })).not.toHaveProperty('locale')
  })
})
