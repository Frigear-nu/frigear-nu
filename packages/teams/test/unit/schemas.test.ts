import { describe, expect, it } from 'vitest'
import { teamInput, teamLadderInput, teamMappingInput, teamRoleMatchSchema } from '../../src/runtime/server/utils/teams-schemas'
import { isTeamsUniqueViolation } from '../../src/runtime/server/utils/teams-errors'

describe('schemas', () => {
  it('takes exactly one key in a match', () => {
    expect(teamRoleMatchSchema.safeParse({ role: 'barmanager' }).success).toBe(true)
    expect(teamRoleMatchSchema.safeParse({ plan: 'yearly' }).success).toBe(true)
    expect(teamRoleMatchSchema.safeParse({ role: 'a', plan: 'b' }).success).toBe(false)
    expect(teamRoleMatchSchema.safeParse({ permission: 'teams:manage' }).success).toBe(false)
    expect(teamRoleMatchSchema.safeParse({}).success).toBe(false)
  })

  it('keeps role keys and kinds lower case', () => {
    expect(teamMappingInput.safeParse({ ownerType: 'operation', ownerId: 'opr_1', match: { role: 'x' }, teamRole: 'BA' }).success).toBe(false)
    expect(teamInput.safeParse({ ownerType: 'platform', kind: 'Bar', name: 'x' }).success).toBe(false)
    expect(teamInput.safeParse({ ownerType: 'platform', kind: 'bar', name: 'x' }).success).toBe(true)
  })

  it('needs a name in at least one language', () => {
    expect(teamInput.safeParse({ ownerType: 'platform', kind: 'bar', name: {} }).success).toBe(false)
    expect(teamInput.safeParse({ ownerType: 'platform', kind: 'bar', name: { en: ' ', da: 'Bar' } }).data?.name).toEqual({ da: 'Bar' })
  })

  it('validates a ladder body', () => {
    expect(teamLadderInput.safeParse({ roles: [{ key: 'a', label: 'A' }], leadFrom: 'a' }).success).toBe(true)
    expect(teamLadderInput.safeParse({ roles: [{ key: 'a', label: 'A' }, { key: 'a', label: 'B' }] }).success).toBe(false)
    expect(teamLadderInput.safeParse({ roles: [{ key: 'a', label: 'A' }], leadFrom: 'b' }).success).toBe(false)
  })
})

describe('isTeamsUniqueViolation', () => {
  it('recognises sqlite and postgresql unique violations, wrapped or not', () => {
    expect(isTeamsUniqueViolation({ code: '23505' })).toBe(true)
    expect(isTeamsUniqueViolation({ code: 'SQLITE_CONSTRAINT_UNIQUE' })).toBe(true)
    expect(isTeamsUniqueViolation(new Error('x', { cause: { message: 'UNIQUE constraint failed: team_members.teamId' } }))).toBe(true)
    expect(isTeamsUniqueViolation({ code: 'SQLITE_CONSTRAINT_FOREIGNKEY' })).toBe(false)
    expect(isTeamsUniqueViolation(new Error('other'))).toBe(false)
  })
})
