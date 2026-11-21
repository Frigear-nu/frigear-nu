import { describe, expect, it } from 'vitest'
import type { TeamRoleGrant } from '@frigear-nu/audience'
import { grantsOfOwner, mappedGrantsFor, mappingCoversTeam, mergeTeamGrants } from '../../src/runtime/utils/resolve'
import type { TeamRoleMappingDto, TeamsResolverTeam } from '../../src/types'

const ladders = { bar: ['volunteer', 'bartender', 'lead', 'coordinator'], firstaid: ['helper', 'medic'] }
const barA: TeamsResolverTeam = { id: 'tem_a', ownerType: 'operation', ownerId: 'opr_1', kind: 'bar' }
const barB: TeamsResolverTeam = { id: 'tem_b', ownerType: 'operation', ownerId: 'opr_1', kind: 'bar' }
const aid: TeamsResolverTeam = { id: 'tem_c', ownerType: 'operation', ownerId: 'opr_1', kind: 'firstaid' }
const otherOwner: TeamsResolverTeam = { id: 'tem_d', ownerType: 'operation', ownerId: 'opr_2', kind: 'bar' }
const platform: TeamsResolverTeam = { id: 'tem_e', ownerType: 'platform', ownerId: null, kind: 'bar' }

let id = 0
const rule = (values: Partial<TeamRoleMappingDto>): TeamRoleMappingDto => ({
  id: `trm_${++id}`,
  ownerType: 'operation',
  ownerId: 'opr_1',
  teamId: null,
  match: { role: 'supervisor' },
  teamRole: 'lead',
  priority: 0,
  createdAt: '',
  updatedAt: '',
  ...values,
})
const explicit = (team: TeamsResolverTeam, role: string): TeamRoleGrant => ({ ownerType: team.ownerType, ownerId: team.ownerId, teamId: team.id, kind: team.kind, role, source: 'explicit' })

describe('mappingCoversTeam', () => {
  it('covers every team of the rule\'s owner, or the one team it names', () => {
    expect(mappingCoversTeam(rule({}), barA)).toBe(true)
    expect(mappingCoversTeam(rule({}), otherOwner)).toBe(false)
    expect(mappingCoversTeam(rule({ teamId: 'tem_a' }), barA)).toBe(true)
    expect(mappingCoversTeam(rule({ teamId: 'tem_a' }), barB)).toBe(false)
    // The platform: `ownerId` null on both sides.
    expect(mappingCoversTeam(rule({ ownerType: 'platform', ownerId: null }), platform)).toBe(true)
    expect(mappingCoversTeam(rule({ ownerType: 'platform', ownerId: null }), barA)).toBe(false)
  })
})

describe('mappedGrantsFor', () => {
  it('gives one grant per covered team whose ladder has the role, with the rule\'s priority', () => {
    const grants = mappedGrantsFor([barA, barB, aid, otherOwner], [rule({ priority: 3 })], ladders)
    expect(grants.map(grant => grant.teamId)).toEqual(['tem_a', 'tem_b'])
    expect(grants[0]).toEqual({ ownerType: 'operation', ownerId: 'opr_1', teamId: 'tem_a', kind: 'bar', role: 'lead', source: 'mapped', priority: 3 })
  })
})

describe('mergeTeamGrants', () => {
  it('keeps explicit grants first, and an explicit grant beats a mapped one on the same team', () => {
    const mapped = mappedGrantsFor([barA, barB], [rule({})], ladders)
    const merged = mergeTeamGrants([explicit(barA, 'volunteer')], mapped, ladders)
    expect(merged).toEqual([
      explicit(barA, 'volunteer'),
      { ownerType: 'operation', ownerId: 'opr_1', teamId: 'tem_b', kind: 'bar', role: 'lead', source: 'mapped' },
    ])
    expect(merged.some(grant => 'priority' in grant)).toBe(false)
  })

  it('picks the highest priority, then the higher role', () => {
    const low = rule({ teamRole: 'coordinator', priority: 0 })
    const high = rule({ teamRole: 'volunteer', priority: 5 })
    const tie = rule({ teamRole: 'bartender', priority: 5 })
    const merged = mergeTeamGrants([], mappedGrantsFor([barA], [low, high, tie], ladders), ladders)
    expect(merged).toEqual([expect.objectContaining({ teamId: 'tem_a', role: 'bartender', source: 'mapped' })])
    expect(mergeTeamGrants([], mappedGrantsFor([barA], [rule({ teamRole: 'volunteer' }), rule({ teamRole: 'lead' })], ladders), ladders))
      .toEqual([expect.objectContaining({ role: 'lead' })])
  })

  it('drops a mapped grant whose role is not on the ladder (pushed by a listener)', () => {
    const merged = mergeTeamGrants([], [{ ...explicit(barA, 'medic'), source: 'mapped', priority: 9 }, { ...explicit(barA, 'volunteer'), source: 'mapped' }], ladders)
    expect(merged).toEqual([expect.objectContaining({ role: 'volunteer' })])
  })
})

describe('grantsOfOwner', () => {
  it('filters by owner type and id, with null for the platform', () => {
    const grants = [explicit(barA, 'lead'), explicit(otherOwner, 'lead'), explicit(platform, 'volunteer')]
    expect(grantsOfOwner(grants, { ownerType: 'operation', ownerId: 'opr_1' }).map(grant => grant.teamId)).toEqual(['tem_a'])
    expect(grantsOfOwner(grants, { ownerType: 'platform', ownerId: null }).map(grant => grant.teamId)).toEqual(['tem_e'])
  })
})
