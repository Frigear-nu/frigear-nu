import { describe, expect, it } from 'vitest'
import { hasPublicGrant } from '@frigear-nu/auth/grants'
import { faqItemInherits, isFaqItemPublic, isFaqItemReadable } from '../../src/runtime/utils'

const pub = [{ kind: 'public' }]
const supervisors = [{ kind: 'role', role: 'supervisor' }]

// Stands in for `grantsCanRead`: `public` admits anyone, `role` grants admit the roles the caller holds.
const caller = (roles: string[]) => async (record: { grants: unknown }) =>
  hasPublicGrant(record.grants) || (Array.isArray(record.grants) && record.grants.some((grant: { kind: string, role?: string }) => grant.kind === 'role' && roles.includes(grant.role ?? '')))
const anonymous = caller([])
const supervisor = caller(['supervisor'])

describe('an item in its group', () => {
  it('inherits the group when it has no list of its own', async () => {
    expect(faqItemInherits({ grants: null })).toBe(true)
    expect(faqItemInherits({ grants: [] })).toBe(false)
    expect(await isFaqItemReadable({ grants: pub }, { grants: null }, anonymous)).toBe(true)
    expect(await isFaqItemReadable({ grants: supervisors }, { grants: null }, anonymous)).toBe(false)
  })

  it('can narrow the group: a public group with a role-only item hides the item from visitors', async () => {
    const group = { grants: pub }
    expect(await isFaqItemReadable(group, { grants: supervisors }, anonymous)).toBe(false)
    expect(await isFaqItemReadable(group, { grants: supervisors }, supervisor)).toBe(true)
  })

  it('can never widen the group: a public item in a restricted group stays restricted', async () => {
    const group = { grants: supervisors }
    expect(await isFaqItemReadable(group, { grants: pub }, anonymous)).toBe(false)
    expect(await isFaqItemReadable(group, { grants: pub }, supervisor)).toBe(true)
  })

  it('admits nobody with an empty list, on the group or the item', async () => {
    expect(await isFaqItemReadable({ grants: [] }, { grants: null }, supervisor)).toBe(false)
    expect(await isFaqItemReadable({ grants: pub }, { grants: [] }, supervisor)).toBe(false)
  })

  it('is public only when anonymous visitors read both', () => {
    expect(isFaqItemPublic({ grants: pub }, { grants: null })).toBe(true)
    expect(isFaqItemPublic({ grants: pub }, { grants: supervisors })).toBe(false)
    expect(isFaqItemPublic({ grants: supervisors }, { grants: pub })).toBe(false)
  })
})
