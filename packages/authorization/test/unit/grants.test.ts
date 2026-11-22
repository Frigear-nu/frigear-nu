import { describe, expect, it } from 'vitest'
import { roleGrantSchema, rolesGranting } from '../../src/runtime/utils/grants'

describe('the role grant kind', () => {
  it('accepts one role and nothing else', () => {
    expect(roleGrantSchema.safeParse({ kind: 'role', role: 'admin' }).success).toBe(true)
    expect(roleGrantSchema.safeParse({ kind: 'role' }).success).toBe(false)
    expect(roleGrantSchema.safeParse({ kind: 'role', roles: ['admin'] }).success).toBe(false)
    expect(roleGrantSchema.safeParse({ kind: 'role', role: 'admin', extra: true }).success).toBe(false)
  })

  it('lists the roles granting a role: itself and every role inheriting it, directly or not', () => {
    const roles = { admin: { inherit: ['lead'] }, lead: { inherit: ['member'] }, member: {}, guest: {} }
    expect(rolesGranting(roles, ['member'])).toEqual(['admin', 'lead', 'member'])
    expect(rolesGranting(roles, ['guest'])).toEqual(['guest'])
  })
})
