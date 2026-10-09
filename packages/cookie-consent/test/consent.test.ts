import { describe, it, expect } from 'vitest'
import {
  DEFAULT_CATEGORIES,
  buildConsent,
  computeVersion,
  mergeCategories,
  normalizeConsent,
  rejectAllChoices,
  acceptAllChoices,
} from '../src/runtime/utils'

const version = computeVersion('1', DEFAULT_CATEGORIES)

describe('consent utils', () => {
  it('always grants required categories and drops unknown keys', () => {
    const state = buildConsent(DEFAULT_CATEGORIES, version, { analytics: true, bogus: true }, 1)
    expect(state.categories).toEqual({ necessary: true, analytics: true, marketing: false })
  })

  it('rejecting keeps only required categories', () => {
    expect(rejectAllChoices(DEFAULT_CATEGORIES)).toEqual({ necessary: true, analytics: false, marketing: false })
    expect(acceptAllChoices(DEFAULT_CATEGORIES)).toEqual({ necessary: true, analytics: true, marketing: true })
  })

  it('migrates the legacy accepted/rejected cookie values', () => {
    expect(normalizeConsent('accepted', DEFAULT_CATEGORIES, version)?.categories.marketing).toBe(true)
    expect(normalizeConsent('rejected', DEFAULT_CATEGORIES, version)?.categories.marketing).toBe(false)
  })

  it('asks again for missing, malformed or outdated consent', () => {
    expect(normalizeConsent(null, DEFAULT_CATEGORIES, version)).toBeNull()
    expect(normalizeConsent({ nope: true }, DEFAULT_CATEGORIES, version)).toBeNull()
    const old = buildConsent(DEFAULT_CATEGORIES, 'other', { analytics: true })
    expect(normalizeConsent(old, DEFAULT_CATEGORIES, version)).toBeNull()
  })

  it('keeps a valid stored choice and its timestamp', () => {
    const stored = buildConsent(DEFAULT_CATEGORIES, version, { analytics: true }, 42)
    expect(normalizeConsent(stored, DEFAULT_CATEGORIES, version)).toEqual(stored)
  })

  it('merges categories by key and concatenates cookies', () => {
    const merged = mergeCategories(
      DEFAULT_CATEGORIES,
      [{ key: 'necessary', cookies: [{ name: 'session' }] }, { key: 'payments', cookies: [{ name: 'stripe_mid' }] }],
      [{ key: 'necessary', cookies: [{ name: 'session' }, { name: 'csrf' }] }],
    )
    expect(merged.map(category => category.key)).toEqual(['necessary', 'analytics', 'marketing', 'payments'])
    expect(merged[0]!.cookies!.map(cookie => cookie.name)).toEqual(['session', 'csrf'])
    expect(merged[0]!.required).toBe(true)
  })

  it('changes the version when the category set changes', () => {
    const extended = mergeCategories(DEFAULT_CATEGORIES, [{ key: 'payments' }])
    expect(computeVersion('1', extended)).not.toBe(version)
    expect(computeVersion('1', DEFAULT_CATEGORIES)).toBe(version)
  })
})
