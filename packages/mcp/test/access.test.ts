import { describe, expect, it } from 'vitest'
import { isPrincipalAllowed, pick, redactPii, scopeTags } from '../src/runtime/utils/access'

const principal = (kind: 'session' | 'user-token', scopes: string[]) => ({ kind, user: { id: 1 }, scopes }) as never

describe('isPrincipalAllowed', () => {
  it('requires a principal and declared scopes', () => {
    expect(isPrincipalAllowed(null, { scopes: ['a:read'] })).toBe(false)
    expect(isPrincipalAllowed(principal('session', ['*']), { scopes: [] })).toBe(false)
  })

  it('honours wildcard, exact and resource-wide scopes', () => {
    expect(isPrincipalAllowed(principal('user-token', ['a:read']), { scopes: ['a:read'] })).toBe(true)
    expect(isPrincipalAllowed(principal('user-token', ['a:*']), { scopes: ['a:read'] })).toBe(true)
    expect(isPrincipalAllowed(principal('user-token', ['b:read']), { scopes: ['a:read'] })).toBe(false)
  })

  it('refuses bearer credentials for session-only definitions', () => {
    expect(isPrincipalAllowed(principal('user-token', ['*']), { scopes: ['a:read'], sessionOnly: true })).toBe(false)
    expect(isPrincipalAllowed(principal('session', ['*']), { scopes: ['a:read'], sessionOnly: true })).toBe(true)
  })
})

describe('redaction', () => {
  const row = { id: 1, email: 'a@b.test', name: 'Ada' }

  it('removes identifying fields unless allowed', () => {
    expect(redactPii(row, { allow: false, fields: ['email', 'name'] })).toEqual({ id: 1 })
    expect(redactPii(row, { allow: true, fields: ['email', 'name'] })).toEqual(row)
  })

  it('picks an explicit allow-list so new columns never leak', () => {
    expect(pick({ ...row, passwordHash: 'x' }, ['id', 'name'])).toEqual({ id: 1, name: 'Ada' })
  })

  it('tags definitions with their scopes', () => {
    expect(scopeTags({ scopes: ['a:read'], sessionOnly: true })).toEqual(['scope:a:read', 'session-only'])
  })
})
