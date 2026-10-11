import { describe, expect, it } from 'vitest'
import { canAdministerUsers } from '../shared/users-policy'

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
})
