import { describe, expect, it } from 'vitest'
import { allowsStaffAddressWrite, isAllowlisted, parseEmailList } from '../shared/acl'

describe('the admin allowlist', () => {
  const admins = parseEmailList(' Boss@Example.com, ,other@example.com')

  it('parses a comma separated list into lowercase addresses', () => {
    expect(admins).toEqual(['boss@example.com', 'other@example.com'])
    expect(parseEmailList(undefined)).toEqual([])
  })

  it('does not count an unverified address', () => {
    expect(isAllowlisted({ email: 'boss@example.com', emailVerifiedAt: null }, admins)).toBe(false)
    expect(isAllowlisted({ email: 'boss@example.com' }, admins)).toBe(false)
  })

  it('counts a verified address, whatever the case', () => {
    expect(isAllowlisted({ email: 'BOSS@example.com', emailVerifiedAt: new Date() }, admins)).toBe(true)
    // Sessions hold the date serialized.
    expect(isAllowlisted({ email: 'other@example.com', emailVerifiedAt: '2026-01-01T00:00:00.000Z' }, admins)).toBe(true)
    expect(isAllowlisted({ email: 'x@example.com', emailVerifiedAt: new Date() }, admins)).toBe(false)
  })
})

describe('admin addresses in the users admin', () => {
  const admins = ['boss@example.com']

  it('lets only admins write an allowlisted address', () => {
    expect(allowsStaffAddressWrite(false, 'Boss@Example.com', admins)).toBe(false)
    expect(allowsStaffAddressWrite(true, 'boss@example.com', admins)).toBe(true)
  })

  it('lets staff write any other address, or none', () => {
    expect(allowsStaffAddressWrite(false, 'someone@example.com', admins)).toBe(true)
    expect(allowsStaffAddressWrite(false, undefined, admins)).toBe(true)
  })
})
