import { describe, it, expect } from 'vitest'
import { decideChangeKind, isEntitledRow, isWithinDisabledRanges, resolvePlanKey, resolveSameOriginUrl } from '../src/runtime/utils/plans'

describe('decideChangeKind', () => {
  it('upgrades when the target rank is higher', () => {
    expect(decideChangeKind(1, 2)).toBe('upgrade')
  })
  it('downgrades when the target rank is lower', () => {
    expect(decideChangeKind(3, 1)).toBe('downgrade')
  })
  it('defers an equal-rank change (e.g. monthly to yearly of one plan)', () => {
    expect(decideChangeKind(2, 2)).toBe('downgrade')
  })
  it('treats an unconfigured current plan as the lowest rank', () => {
    expect(decideChangeKind(null, 1)).toBe('upgrade')
    expect(decideChangeKind(undefined, 0)).toBe('upgrade')
  })
})

describe('resolvePlanKey', () => {
  const plans = {
    member: { rank: 1, prices: ['price_a', { lookupKey: 'member_yearly' }] },
    patron: { rank: 2, prices: ['price_b'] },
  }
  it('matches by price id and by lookup key', () => {
    expect(resolvePlanKey(plans, { id: 'price_a' })).toBe('member')
    expect(resolvePlanKey(plans, { id: 'price_x', lookupKey: 'member_yearly' })).toBe('member')
    expect(resolvePlanKey(plans, { id: 'price_b' })).toBe('patron')
  })
  it('returns null for unknown prices', () => {
    expect(resolvePlanKey(plans, { id: 'price_unknown', lookupKey: 'nope' })).toBeNull()
  })
})

describe('resolveSameOriginUrl', () => {
  const origin = 'https://example.com'
  it('accepts relative paths and same-origin absolute URLs', () => {
    expect(resolveSameOriginUrl('/ok?x=1', origin)).toBe('https://example.com/ok?x=1')
    expect(resolveSameOriginUrl('https://example.com/a?s={CHECKOUT_SESSION_ID}', origin)).toBe('https://example.com/a?s={CHECKOUT_SESSION_ID}')
  })
  it('rejects other origins and protocol-relative URLs', () => {
    expect(resolveSameOriginUrl('https://evil.com/x', origin)).toBeNull()
    expect(resolveSameOriginUrl('//evil.com', origin)).toBeNull()
    expect(resolveSameOriginUrl('/\\evil.com', origin)).toBeNull()
    expect(resolveSameOriginUrl('javascript:alert(1)', origin)).toBeNull()
    expect(resolveSameOriginUrl('relative/path', origin)).toBeNull()
  })
})

describe('isEntitledRow', () => {
  const base = { status: 'active', endedAt: null, currentPeriodEnd: null }
  const now = Date.parse('2026-01-01T00:00:00Z')
  it('requires an entitled status and no end', () => {
    expect(isEntitledRow(base)).toBe(true)
    expect(isEntitledRow({ ...base, status: 'past_due' })).toBe(false)
    expect(isEntitledRow({ ...base, endedAt: new Date() })).toBe(false)
  })
  it('expires manual grants at their end date but leaves Stripe rows to the webhook', () => {
    const past = new Date(now - 1000)
    const future = new Date(now + 1000)
    expect(isEntitledRow({ ...base, source: 'manual', currentPeriodEnd: past }, undefined, now)).toBe(false)
    expect(isEntitledRow({ ...base, source: 'manual', currentPeriodEnd: future }, undefined, now)).toBe(true)
    expect(isEntitledRow({ ...base, source: 'manual' }, undefined, now)).toBe(true)
    expect(isEntitledRow({ ...base, source: 'stripe', currentPeriodEnd: past }, undefined, now)).toBe(true)
  })
})

describe('isWithinDisabledRanges', () => {
  const now = new Date('2026-07-15T12:00:00Z')
  it('is true inside a range (inclusive) and false outside', () => {
    expect(isWithinDisabledRanges([{ from: '2026-07-01', to: '2026-08-31' }], now)).toBe(true)
    expect(isWithinDisabledRanges([{ from: '2026-08-01', to: '2026-08-31' }], now)).toBe(false)
  })
  it('replaces {fullYear} with the current year', () => {
    expect(isWithinDisabledRanges([{ from: '{fullYear}-07-01', to: '{fullYear}-07-31' }], now)).toBe(true)
  })
  it('ignores unparseable ranges and empty input', () => {
    expect(isWithinDisabledRanges([{ from: 'nope', to: 'nah' }], now)).toBe(false)
    expect(isWithinDisabledRanges(undefined, now)).toBe(false)
  })
})
