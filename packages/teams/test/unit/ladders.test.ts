import { describe, expect, it } from 'vitest'
import { DEFAULT_TEAM_LADDERS, isLeadRole, ladderKeys, mergeTeamLadders, teamLadderIssues, teamRoleRank } from '../../src/runtime/utils/ladders'

const bar = ladderKeys(DEFAULT_TEAM_LADDERS.bar)

describe('ladders', () => {
  it('ships the bar ladder, lowest first, led from ba', () => {
    expect(bar).toEqual(['volunteer', 'bartender', 'ba', 'coordinator'])
    expect(DEFAULT_TEAM_LADDERS.bar!.leadFrom).toBe('ba')
    expect(DEFAULT_TEAM_LADDERS.bar!.roles.every(role => typeof role.label === 'object' && role.label.en && role.label.da)).toBe(true)
  })

  it('compares roles on a ladder', () => {
    expect(teamRoleRank(bar, 'volunteer')).toBe(0)
    expect(teamRoleRank(bar, 'coordinator')).toBe(3)
    expect(teamRoleRank(bar, 'medic')).toBe(-1)
    expect(teamRoleRank(undefined, 'ba')).toBe(-1)
  })

  it('leads from the ladder\'s leadFrom and up', () => {
    expect(isLeadRole(bar, 'ba', 'ba')).toBe(true)
    expect(isLeadRole(bar, 'coordinator', 'ba')).toBe(true)
    expect(isLeadRole(bar, 'bartender', 'ba')).toBe(false)
    expect(isLeadRole(bar, 'ba', null)).toBe(false)
    expect(isLeadRole(bar, 'medic', 'ba')).toBe(false)
    expect(isLeadRole(bar, 'ba', 'medic')).toBe(false)
  })

  it('validates a ladder', () => {
    expect(teamLadderIssues(DEFAULT_TEAM_LADDERS.bar!)).toEqual([])
    expect(teamLadderIssues({ roles: [] })).toHaveLength(1)
    expect(teamLadderIssues({ roles: [{ key: 'A', label: 'A' }] })).toHaveLength(1)
    expect(teamLadderIssues({ roles: [{ key: 'a', label: 'A' }, { key: 'a', label: 'A' }] })).toHaveLength(1)
    expect(teamLadderIssues({ roles: [{ key: 'a', label: 'A' }], leadFrom: 'b' })).toHaveLength(1)
  })

  it('merges the option over the defaults, a kind in the option replacing the default one', () => {
    const merged = mergeTeamLadders({ bar: { roles: [{ key: 'crew', label: 'Crew' }] }, firstaid: { roles: [{ key: 'helper', label: 'Helper' }] } })
    expect(Object.keys(merged)).toEqual(['bar', 'firstaid'])
    expect(ladderKeys(merged.bar)).toEqual(['crew'])
    expect(mergeTeamLadders(undefined)).toEqual(DEFAULT_TEAM_LADDERS)
  })
})
