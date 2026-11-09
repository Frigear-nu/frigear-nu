import { describe, expect, it } from 'vitest'
import { hasScope, hasScopes, isGrantableScope, parseScopeString, principalHasScopes } from '../../src/runtime/utils/scopes'

describe('hasScope', () => {
  it('matches exact scopes', () => {
    expect(hasScope(['events:read'], 'events:read')).toBe(true)
    expect(hasScope(['events:read'], 'events:write')).toBe(false)
    expect(hasScope([], 'events:read')).toBe(false)
  })

  it('treats * as full access', () => {
    expect(hasScope(['*'], 'anything:at-all')).toBe(true)
  })

  it('never covers personal-data (:pii) scopes with a wildcard', () => {
    expect(hasScope(['*'], 'events:pii')).toBe(false)
    expect(hasScope(['events:*'], 'events:pii')).toBe(false)
    expect(hasScope(['events:read', 'events:pii'], 'events:pii')).toBe(true)
    expect(hasScopes(['*'], ['events:manage', 'events:pii'])).toBe(false)
    expect(hasScope(['*'], 'events:manage')).toBe(true)
  })

  it('supports resource wildcards without leaking across resources', () => {
    expect(hasScope(['events:*'], 'events:read')).toBe(true)
    expect(hasScope(['events:*'], 'forms:read')).toBe(false)
    expect(hasScope(['events:*'], 'events')).toBe(false)
  })

  it('does not treat a prefix as a wildcard', () => {
    expect(hasScope(['events'], 'events:read')).toBe(false)
    expect(hasScope(['event:*'], 'events:read')).toBe(false)
  })
})

describe('hasScopes', () => {
  it('requires every scope', () => {
    expect(hasScopes(['a:read', 'b:read'], ['a:read', 'b:read'])).toBe(true)
    expect(hasScopes(['a:read'], ['a:read', 'b:read'])).toBe(false)
    expect(hasScopes([], [])).toBe(true)
  })
})

describe('parseScopeString', () => {
  it('splits on whitespace and de-duplicates', () => {
    expect(parseScopeString('openid  profile\temail profile')).toEqual(['openid', 'profile', 'email'])
    expect(parseScopeString('')).toEqual([])
    expect(parseScopeString(undefined)).toEqual([])
  })
})

describe('isGrantableScope', () => {
  const registered = ['events:read', 'events:write', 'forms:read']

  it('allows full access and registered scopes', () => {
    expect(isGrantableScope('*', registered)).toBe(true)
    expect(isGrantableScope('events:read', registered)).toBe(true)
  })

  it('allows wildcards only for resources that have scopes', () => {
    expect(isGrantableScope('events:*', registered)).toBe(true)
    expect(isGrantableScope('payments:*', registered)).toBe(false)
    expect(isGrantableScope(':*', registered)).toBe(false)
    expect(isGrantableScope('even:*', registered)).toBe(false)
  })

  it('rejects unknown scopes', () => {
    expect(isGrantableScope('events:delete', registered)).toBe(false)
    expect(isGrantableScope('', registered)).toBe(false)
  })
})

describe('principalHasScopes', () => {
  it('needs only the scopes without a ceiling (no access control)', () => {
    expect(principalHasScopes({ scopes: ['*'] }, ['events:manage'])).toBe(true)
  })

  it('caps a credential at its user\'s current permissions', () => {
    const token = { scopes: ['events:*'], ceiling: ['tickets:read'] }
    expect(principalHasScopes(token, ['events:manage'])).toBe(false)
    expect(principalHasScopes({ ...token, ceiling: ['events:*'] }, ['events:manage'])).toBe(true)
    expect(principalHasScopes({ scopes: ['*'], ceiling: ['tickets:read'] }, ['tickets:read'])).toBe(true)
    expect(principalHasScopes({ scopes: ['*'], ceiling: ['tickets:read'] }, ['tickets:write'])).toBe(false)
  })

  it('keeps :pii out of wildcards on both sides', () => {
    expect(principalHasScopes({ scopes: ['events:pii'], ceiling: ['*'] }, ['events:pii'])).toBe(false)
    expect(principalHasScopes({ scopes: ['events:pii'], ceiling: ['events:pii'] }, ['events:pii'])).toBe(true)
  })
})
