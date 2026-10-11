import { describe, expect, it } from 'vitest'
import { canManageRole, roleIsHigher, roleIsHigherOrEqual } from '../src/runtime/utils/roles'

const roles = ['admin', 'manager', 'coordinator', 'member', 'user'] as const

describe('roleIsHigher', () => {
  it('compares by position, highest first', () => {
    expect(roleIsHigher(roles, 'admin', 'manager')).toBe(true)
    expect(roleIsHigher(roles, 'manager', 'admin')).toBe(false)
    expect(roleIsHigher(roles, 'manager', 'manager')).toBe(false)
  })

  it('never ranks unknown or missing roles', () => {
    expect(roleIsHigher(roles, 'root', 'user')).toBe(false)
    expect(roleIsHigher(roles, 'admin', 'nope')).toBe(false)
    expect(roleIsHigher(roles, undefined, 'user')).toBe(false)
    expect(roleIsHigher(roles, 'admin', null)).toBe(false)
  })
})

describe('roleIsHigherOrEqual', () => {
  it('includes equal roles', () => {
    expect(roleIsHigherOrEqual(roles, 'manager', 'manager')).toBe(true)
    expect(roleIsHigherOrEqual(roles, 'member', 'manager')).toBe(false)
  })
})

describe('canManageRole', () => {
  it('allows only strictly lower roles by default', () => {
    expect(canManageRole(roles, 'manager', 'member')).toBe(true)
    expect(canManageRole(roles, 'manager', 'manager')).toBe(false)
    expect(canManageRole(roles, 'manager', 'admin')).toBe(false)
  })

  it('lets the listed roles manage their own rank', () => {
    expect(canManageRole(roles, 'admin', 'admin', { equalAllowedFor: ['admin'] })).toBe(true)
    expect(canManageRole(roles, 'manager', 'manager', { equalAllowedFor: ['admin'] })).toBe(false)
    expect(canManageRole(roles, 'root', 'root', { equalAllowedFor: ['root'] })).toBe(false)
  })
})
