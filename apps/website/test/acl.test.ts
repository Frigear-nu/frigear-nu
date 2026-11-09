import { describe, expect, it } from 'vitest'
import { isAllowlisted, parseEmailList, resolveEffectiveRole } from '../shared/acl'
import { userRoles } from '../shared/roles'

describe('email allowlists', () => {
  const admins = parseEmailList(' Boss@Example.com, ,other@example.com')

  it('parses a comma separated list into lowercase addresses', () => {
    expect(admins).toEqual(['boss@example.com', 'other@example.com'])
    expect(parseEmailList(undefined)).toEqual([])
  })

  it('does not make an unverified allowlisted address an admin', () => {
    expect(resolveEffectiveRole({ email: 'boss@example.com', role: 'user', emailVerifiedAt: null }, admins, userRoles)).toBe('user')
    expect(resolveEffectiveRole({ email: 'boss@example.com', role: 'member' }, admins, userRoles)).toBe('member')
    expect(isAllowlisted({ email: 'boss@example.com' }, admins)).toBe(false)
  })

  it('makes a verified allowlisted address an admin, whatever the case', () => {
    expect(resolveEffectiveRole({ email: 'BOSS@example.com', role: 'user', emailVerifiedAt: new Date() }, admins, userRoles)).toBe('admin')
    // Sessions hold the date serialized.
    expect(isAllowlisted({ email: 'other@example.com', emailVerifiedAt: '2026-01-01T00:00:00.000Z' }, admins)).toBe(true)
  })

  it('keeps the stored role otherwise, and ignores unknown roles', () => {
    expect(resolveEffectiveRole({ email: 'x@example.com', role: 'manager', emailVerifiedAt: new Date() }, admins, userRoles)).toBe('manager')
    expect(resolveEffectiveRole({ email: 'x@example.com', role: 'root', emailVerifiedAt: new Date() }, admins, userRoles)).toBe('user')
  })
})
