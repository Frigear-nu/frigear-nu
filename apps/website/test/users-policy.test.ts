import { describe, expect, it } from 'vitest'
import { assignableUserRoles, canAdministerUsers } from '../shared/users-policy'

describe('canAdministerUsers', () => {
  it('lets staff roles list users but not create or edit them unless admin/manager', () => {
    expect(canAdministerUsers('coordinator', 'view')).toBe(true)
    expect(canAdministerUsers('coordinator', 'create', { input: { role: 'user' } })).toBe(false)
    expect(canAdministerUsers('member', 'view')).toBe(false)
  })

  it('keeps managers strictly below their own role', () => {
    expect(canAdministerUsers('manager', 'create', { input: { role: 'member' } })).toBe(true)
    expect(canAdministerUsers('manager', 'create', { input: { role: 'manager' } })).toBe(false)
    expect(canAdministerUsers('manager', 'create', { input: { role: 'admin' } })).toBe(false)
    expect(canAdministerUsers('manager', 'update', { input: { role: 'admin' }, target: { role: 'user' } })).toBe(false)
  })

  it('does not let a manager edit someone ranked above them, whatever they write', () => {
    expect(canAdministerUsers('manager', 'update', { input: {}, target: { role: 'admin' } })).toBe(false)
    expect(canAdministerUsers('manager', 'update', { input: {}, target: { role: 'manager' } })).toBe(false)
    expect(canAdministerUsers('manager', 'update', { input: {}, target: { role: 'member' } })).toBe(true)
  })

  it('lets admins manage other admins', () => {
    expect(canAdministerUsers('admin', 'create', { input: { role: 'admin' } })).toBe(true)
    expect(canAdministerUsers('admin', 'update', { input: { role: 'manager' }, target: { role: 'admin' } })).toBe(true)
  })

  it('ignores unknown roles', () => {
    expect(canAdministerUsers('admin', 'create', { input: { role: 'root' } })).toBe(false)
    expect(canAdministerUsers('root', 'view')).toBe(false)
  })
  it('does not let a manager move an account onto an allowlisted staff address', () => {
    const staffEmails = ['boss@example.com', 'forms@example.com']
    expect(canAdministerUsers('manager', 'update', { input: { email: 'Boss@Example.com' }, target: { role: 'user' }, staffEmails })).toBe(false)
    expect(canAdministerUsers('manager', 'update', { input: { email: 'forms@example.com' }, target: { role: 'member' }, staffEmails })).toBe(false)
    expect(canAdministerUsers('manager', 'create', { input: { email: 'boss@example.com', role: 'user' }, staffEmails })).toBe(false)
    expect(canAdministerUsers('manager', 'update', { input: { email: 'someone@example.com' }, target: { role: 'user' }, staffEmails })).toBe(true)
    expect(canAdministerUsers('admin', 'update', { input: { email: 'boss@example.com' }, target: { role: 'user' }, staffEmails })).toBe(true)
  })

  it('lets managers and admins delete users below their rank only', () => {
    expect(canAdministerUsers('manager', 'delete', { target: { role: 'member' } })).toBe(true)
    expect(canAdministerUsers('manager', 'delete', { target: { role: 'admin' } })).toBe(false)
    expect(canAdministerUsers('coordinator', 'delete', { target: { role: 'user' } })).toBe(false)
  })
})

describe('assignableUserRoles', () => {
  it('offers strictly lower roles, plus their own for admins', () => {
    expect(assignableUserRoles('admin')).toContain('admin')
    expect(assignableUserRoles('manager')).not.toContain('manager')
    expect(assignableUserRoles('manager')).toContain('coordinator')
    expect(assignableUserRoles('coordinator')).toEqual([])
  })
})
