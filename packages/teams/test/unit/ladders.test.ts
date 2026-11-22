import { describe, expect, it } from 'vitest'
import { DEFAULT_TEAM_KIND, DEFAULT_TEAM_LADDERS, isLeadRole, ladderKeys, mergeTeamLadders, teamLadderIssues, teamRoleRank } from '../../src/runtime/utils/ladders'

const bar = ['volunteer', 'bartender', 'lead', 'coordinator']

describe('ladders', () => {
  it('ships one generic ladder, member then lead, led from lead', () => {
    expect(Object.keys(DEFAULT_TEAM_LADDERS)).toEqual([DEFAULT_TEAM_KIND])
    expect(ladderKeys(DEFAULT_TEAM_LADDERS[DEFAULT_TEAM_KIND])).toEqual(['member', 'lead'])
    expect(DEFAULT_TEAM_LADDERS[DEFAULT_TEAM_KIND]!.leadFrom).toBe('lead')
    expect(DEFAULT_TEAM_LADDERS[DEFAULT_TEAM_KIND]!.roles.every(role => typeof role.label === 'object' && role.label.en && role.label.da)).toBe(true)
  })

  it('compares roles on a ladder', () => {
    expect(teamRoleRank(bar, 'volunteer')).toBe(0)
    expect(teamRoleRank(bar, 'coordinator')).toBe(3)
    expect(teamRoleRank(bar, 'medic')).toBe(-1)
    expect(teamRoleRank(undefined, 'lead')).toBe(-1)
  })

  it('leads from the ladder\'s leadFrom and up', () => {
    expect(isLeadRole(bar, 'lead', 'lead')).toBe(true)
    expect(isLeadRole(bar, 'coordinator', 'lead')).toBe(true)
    expect(isLeadRole(bar, 'bartender', 'lead')).toBe(false)
    expect(isLeadRole(bar, 'lead', null)).toBe(false)
    expect(isLeadRole(bar, 'medic', 'lead')).toBe(false)
    expect(isLeadRole(bar, 'lead', 'medic')).toBe(false)
  })

  it('validates a ladder', () => {
    expect(teamLadderIssues(DEFAULT_TEAM_LADDERS[DEFAULT_TEAM_KIND]!)).toEqual([])
    expect(teamLadderIssues({ roles: [] })).toHaveLength(1)
    expect(teamLadderIssues({ roles: [{ key: 'A', label: 'A' }] })).toHaveLength(1)
    expect(teamLadderIssues({ roles: [{ key: 'a', label: 'A' }, { key: 'a', label: 'A' }] })).toHaveLength(1)
    expect(teamLadderIssues({ roles: [{ key: 'a', label: 'A' }], leadFrom: 'b' })).toHaveLength(1)
  })

  it('merges the option over the defaults, a kind in the option replacing the default one', () => {
    const merged = mergeTeamLadders({ default: { roles: [{ key: 'crew', label: 'Crew' }] }, firstaid: { roles: [{ key: 'helper', label: 'Helper' }] } })
    expect(Object.keys(merged)).toEqual(['default', 'firstaid'])
    expect(ladderKeys(merged.default)).toEqual(['crew'])
    expect(mergeTeamLadders(undefined)).toEqual(DEFAULT_TEAM_LADDERS)
  })
})
