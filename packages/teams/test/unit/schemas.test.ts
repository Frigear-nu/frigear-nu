import { describe, expect, it } from 'vitest'
import { teamInput, teamLadderInput, teamMappingInput, teamRoleMatchSchema } from '../../src/runtime/server/utils/teams-schemas'
import { isTeamKindGrant, teamGrantSchema } from '../../src/runtime/utils/grants'

describe('schemas', () => {
  it('takes exactly one key in a match', () => {
    expect(teamRoleMatchSchema.safeParse({ role: 'supervisor' }).success).toBe(true)
    expect(teamRoleMatchSchema.safeParse({ plan: 'yearly' }).success).toBe(true)
    expect(teamRoleMatchSchema.safeParse({ role: 'a', plan: 'b' }).success).toBe(false)
    expect(teamRoleMatchSchema.safeParse({ permission: 'teams:manage' }).success).toBe(false)
    expect(teamRoleMatchSchema.safeParse({}).success).toBe(false)
  })

  it('keeps role keys and kinds lower case', () => {
    expect(teamMappingInput.safeParse({ ownerType: 'operation', ownerId: 'opr_1', match: { role: 'x' }, teamRole: 'Lead' }).success).toBe(false)
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

describe('teamGrantSchema', () => {
  it('takes one team or every team of a kind, never both', () => {
    expect(teamGrantSchema.safeParse({ kind: 'team', teamId: 'tem_1', minRole: 'lead' }).success).toBe(true)
    expect(teamGrantSchema.safeParse({ kind: 'team', teamKind: 'bar', minRole: 'lead' }).success).toBe(true)
    expect(teamGrantSchema.safeParse({ kind: 'team', teamId: 'tem_1', teamKind: 'bar', minRole: 'lead' }).success).toBe(false)
    expect(teamGrantSchema.safeParse({ kind: 'team', minRole: 'lead' }).success).toBe(false)
    expect(teamGrantSchema.safeParse({ kind: 'team', teamKind: '', minRole: 'lead' }).success).toBe(false)
    expect(teamGrantSchema.safeParse({ kind: 'team', teamKind: 'bar' }).success).toBe(false)
  })

  it('tells the two apart', () => {
    expect(isTeamKindGrant({ kind: 'team', teamKind: 'bar', minRole: 'lead' })).toBe(true)
    expect(isTeamKindGrant({ kind: 'team', teamId: 'tem_1', minRole: 'lead' })).toBe(false)
  })
})
