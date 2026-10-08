import { describe, it, expect } from 'vitest'
import { decideChangeKind, resolvePlanKey, resolveSameOriginUrl } from '../src/runtime/utils/plans'

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
