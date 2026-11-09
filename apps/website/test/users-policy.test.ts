import { describe, expect, it } from 'vitest'
import { allowsStaffAddressChange } from '../shared/users-policy'

describe('allowsStaffAddressChange', () => {
  const staffEmails = ['boss@example.com', 'forms@example.com']

  it('does not let a non-admin move an account onto an allowlisted staff address', () => {
    expect(allowsStaffAddressChange('manager', { input: { email: 'Boss@Example.com' }, target: { role: 'user' }, staffEmails })).toBe(false)
    expect(allowsStaffAddressChange('manager', { input: { email: 'forms@example.com' }, staffEmails })).toBe(false)
    expect(allowsStaffAddressChange('manager', { input: { email: 'someone@example.com' }, target: { role: 'user' }, staffEmails })).toBe(true)
    expect(allowsStaffAddressChange('admin', { input: { email: 'boss@example.com' }, target: { role: 'user' }, staffEmails })).toBe(true)
  })

  it('keeps allowlisted admins out of reach of non-admins', () => {
    expect(allowsStaffAddressChange('manager', { input: {}, target: { role: 'admin' } })).toBe(false)
    expect(allowsStaffAddressChange('admin', { input: {}, target: { role: 'admin' } })).toBe(true)
  })

  it('leaves everything else to the roles', () => {
    expect(allowsStaffAddressChange('manager', { input: { email: 'x@example.com' }, target: { role: 'member' } })).toBe(true)
  })
})
