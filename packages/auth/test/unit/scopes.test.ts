import { describe, expect, it } from 'vitest'
import { hasScope, hasScopes, isGrantableScope, parseScopeString } from '../../src/runtime/utils/scopes'

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
