import { describe, expect, it } from 'vitest'
import {
  createViewer,
  isEmptyVisibility,
  isNarrowerOrEqual,
  isVisible,
  narrowVisibility,
  NOBODY,
  OWNER_TYPES,
  parseVisibility,
  roleAtLeast,
  visibilitySchema,
} from '../src/index.ts'
import type { TeamRoleGrant, Viewer } from '../src/index.ts'

const BAR = ['volunteer', 'bartender', 'ba', 'coordinator']
const ladders = { bar: BAR }

function grant(role: string, overrides: Partial<TeamRoleGrant> = {}): TeamRoleGrant {
  return { ownerType: 'operation', ownerId: 'opr_roskilde', teamId: 'tem_bar1', kind: 'bar', role, source: 'explicit', ...overrides }
}

function viewer(overrides: Partial<Viewer> = {}): Viewer {
  return createViewer({ userId: 1, ladders, ...overrides })
}

describe('roleAtLeast', () => {
  it('compares positions in the ladder, lowest first', () => {
    expect(roleAtLeast(BAR, 'ba', 'bartender')).toBe(true)
    expect(roleAtLeast(BAR, 'ba', 'ba')).toBe(true)
    expect(roleAtLeast(BAR, 'volunteer', 'ba')).toBe(false)
    expect(roleAtLeast(BAR, 'coordinator', 'volunteer')).toBe(true)
  })

  it('fails closed on a role missing from the ladder', () => {
    expect(roleAtLeast(BAR, 'admin', 'volunteer')).toBe(false)
    expect(roleAtLeast(BAR, 'coordinator', 'chief')).toBe(false)
    expect(roleAtLeast([], 'ba', 'ba')).toBe(false)
  })
})

describe('isVisible', () => {
  const anonymous = createViewer()

  it('shows public records to everyone, anonymous included', () => {
    expect(isVisible({ public: true }, null)).toBe(true)
    expect(isVisible({ public: true }, anonymous)).toBe(true)
    expect(isVisible({ public: true, globalRoles: ['admin'] }, null)).toBe(true)
  })

  it('shows empty visibility to signed-in viewers only', () => {
    for (const empty of [null, undefined, {}, { public: false }]) {
      expect(isVisible(empty, null)).toBe(false)
      expect(isVisible(empty, anonymous)).toBe(false)
      expect(isVisible(empty, viewer())).toBe(true)
    }
  })

  it('hides restricted records from anonymous viewers', () => {
    expect(isVisible({ globalRoles: ['admin'] }, createViewer({ globalRoles: ['admin'] }))).toBe(false)
  })

  it('matches any of the global roles', () => {
    const visibility = { globalRoles: ['admin', 'coordinator'] }
    expect(isVisible(visibility, viewer({ globalRoles: ['coordinator'] }))).toBe(true)
    expect(isVisible(visibility, viewer({ globalRoles: ['member'] }))).toBe(false)
    expect(isVisible({ globalRoles: [] }, viewer({ globalRoles: ['admin'] }))).toBe(false)
  })

  it('requires a team role at or above the minimum of the ladder', () => {
    const visibility = { minTeamRole: { kind: 'bar', role: 'ba' } }
    expect(isVisible(visibility, viewer({ teamRoles: [grant('ba')] }))).toBe(true)
    expect(isVisible(visibility, viewer({ teamRoles: [grant('coordinator')] }))).toBe(true)
    expect(isVisible(visibility, viewer({ teamRoles: [grant('bartender')] }))).toBe(false)
    expect(isVisible(visibility, viewer({ teamRoles: [grant('volunteer'), grant('ba', { teamId: 'tem_bar2' })] }))).toBe(true)
    expect(isVisible(visibility, viewer())).toBe(false)
  })

  it('fails closed on an unknown ladder kind or role', () => {
    expect(isVisible({ minTeamRole: { kind: 'first-aid', role: 'medic' } }, viewer({
      teamRoles: [grant('medic', { kind: 'first-aid' })],
    }))).toBe(false)
    expect(isVisible({ minTeamRole: { kind: 'bar', role: 'chief' } }, viewer({ teamRoles: [grant('coordinator')] }))).toBe(false)
    expect(isVisible({ minTeamRole: { kind: 'bar', role: 'ba' } }, viewer({ teamRoles: [grant('owner')] }))).toBe(false)
  })

  it('ignores a grant of another kind', () => {
    const firstAid = { ...ladders, 'first-aid': ['helper', 'medic'] }
    expect(isVisible({ minTeamRole: { kind: 'bar', role: 'volunteer' } }, viewer({
      ladders: firstAid,
      teamRoles: [grant('medic', { kind: 'first-aid' })],
    }))).toBe(false)
  })

  it('requires taking part in the operation', () => {
    const visibility = { operationId: 'opr_roskilde' }
    expect(isVisible(visibility, viewer({ operationIds: ['opr_roskilde'] }))).toBe(true)
    expect(isVisible(visibility, viewer({ teamRoles: [grant('volunteer')] }))).toBe(true)
    expect(isVisible(visibility, viewer({ operationIds: ['opr_other'] }))).toBe(false)
    expect(isVisible(visibility, viewer({ teamRoles: [grant('ba', { ownerType: 'team', ownerId: 'opr_roskilde' })] }))).toBe(false)
  })

  it('scopes the team role to the operation when both are set', () => {
    const visibility = { operationId: 'opr_roskilde', minTeamRole: { kind: 'bar', role: 'ba' } }
    expect(isVisible(visibility, viewer({ teamRoles: [grant('ba')] }))).toBe(true)
    // BA elsewhere, only a volunteer at Roskilde.
    expect(isVisible(visibility, viewer({
      teamRoles: [grant('ba', { ownerId: 'opr_other' }), grant('volunteer')],
    }))).toBe(false)
    // BA on a team owned by something other than an operation.
    expect(isVisible(visibility, viewer({
      operationIds: ['opr_roskilde'],
      teamRoles: [grant('ba', { ownerType: 'platform', ownerId: 'opr_roskilde' })],
    }))).toBe(false)
  })

  it('requires every key that is set', () => {
    const visibility = { globalRoles: ['crew'], operationId: 'opr_roskilde' }
    expect(isVisible(visibility, viewer({ globalRoles: ['crew'], operationIds: ['opr_roskilde'] }))).toBe(true)
    expect(isVisible(visibility, viewer({ globalRoles: ['crew'] }))).toBe(false)
    expect(isVisible(visibility, viewer({ operationIds: ['opr_roskilde'] }))).toBe(false)
  })
})

describe('narrowVisibility', () => {
  it('lets an empty child inherit the parent', () => {
    expect(narrowVisibility({ globalRoles: ['crew'] }, null)).toEqual({ globalRoles: ['crew'] })
    expect(narrowVisibility({ public: true }, {})).toEqual({ public: true })
    expect(narrowVisibility(null, undefined)).toEqual({})
  })

  it('does not let a public child widen a restricted parent', () => {
    expect(narrowVisibility({ globalRoles: ['crew'] }, { public: true })).toEqual({ globalRoles: ['crew'] })
    expect(narrowVisibility(null, { public: true })).toEqual({})
    const combined = narrowVisibility({ operationId: 'opr_roskilde' }, { public: true })
    expect(isVisible(combined, null)).toBe(false)
  })

  it('takes the child as it is under a public parent', () => {
    expect(narrowVisibility({ public: true }, { minTeamRole: { kind: 'bar', role: 'ba' } }))
      .toEqual({ minTeamRole: { kind: 'bar', role: 'ba' } })
    expect(narrowVisibility({ public: true }, { public: true })).toEqual({ public: true })
  })

  it('combines keys with AND', () => {
    expect(narrowVisibility({ globalRoles: ['crew', 'admin'] }, { globalRoles: ['admin', 'member'] }))
      .toEqual({ globalRoles: ['admin'] })
    expect(narrowVisibility({ operationId: 'opr_roskilde' }, { minTeamRole: { kind: 'bar', role: 'ba' } }))
      .toEqual({ operationId: 'opr_roskilde', minTeamRole: { kind: 'bar', role: 'ba' } })
    expect(narrowVisibility({ minTeamRole: { kind: 'bar', role: 'bartender' } }, { minTeamRole: { kind: 'bar', role: 'ba' } }, ladders))
      .toEqual({ minTeamRole: { kind: 'bar', role: 'ba' } })
    expect(narrowVisibility({ minTeamRole: { kind: 'bar', role: 'coordinator' } }, { minTeamRole: { kind: 'bar', role: 'volunteer' } }, ladders))
      .toEqual({ minTeamRole: { kind: 'bar', role: 'coordinator' } })
  })

  it('fails closed when the combination cannot be expressed', () => {
    expect(narrowVisibility({ operationId: 'opr_a' }, { operationId: 'opr_b' })).toEqual(NOBODY)
    expect(narrowVisibility({ minTeamRole: { kind: 'bar', role: 'ba' } }, { minTeamRole: { kind: 'first-aid', role: 'medic' } }, ladders)).toEqual(NOBODY)
    expect(narrowVisibility({ minTeamRole: { kind: 'bar', role: 'ba' } }, { minTeamRole: { kind: 'bar', role: 'coordinator' } })).toEqual(NOBODY)
    expect(isVisible(NOBODY, viewer({ globalRoles: ['admin'] }))).toBe(false)
  })

  it('never shows the combination to a viewer the parent hides', () => {
    const parents = [null, { public: true }, { globalRoles: ['crew'] }, { operationId: 'opr_roskilde' }, { minTeamRole: { kind: 'bar', role: 'ba' } }]
    const children = [null, { public: true }, { globalRoles: ['crew', 'admin'] }, { operationId: 'opr_roskilde' }, { minTeamRole: { kind: 'bar', role: 'bartender' } }]
    const viewers = [
      null,
      viewer(),
      viewer({ globalRoles: ['crew'] }),
      viewer({ globalRoles: ['admin'], operationIds: ['opr_roskilde'] }),
      viewer({ teamRoles: [grant('bartender')] }),
      viewer({ teamRoles: [grant('ba')], globalRoles: ['crew'] }),
    ]
    for (const parent of parents) {
      for (const child of children) {
        const combined = narrowVisibility(parent, child, ladders)
        for (const v of viewers) {
          if (isVisible(combined, v)) {
            expect(isVisible(parent, v)).toBe(true)
          }
        }
      }
    }
  })
})

describe('isNarrowerOrEqual', () => {
  it('accepts anything under a public parent, and an empty child anywhere', () => {
    expect(isNarrowerOrEqual({ public: true }, { public: true })).toBe(true)
    expect(isNarrowerOrEqual({ public: true }, { globalRoles: ['crew'] })).toBe(true)
    expect(isNarrowerOrEqual({ globalRoles: ['crew'] }, null)).toBe(true)
  })

  it('rejects a public child under a restricted parent', () => {
    expect(isNarrowerOrEqual(null, { public: true })).toBe(false)
    expect(isNarrowerOrEqual({ globalRoles: ['crew'] }, { public: true })).toBe(false)
  })

  it('compares key by key', () => {
    expect(isNarrowerOrEqual({ globalRoles: ['crew', 'admin'] }, { globalRoles: ['admin'] })).toBe(true)
    expect(isNarrowerOrEqual({ globalRoles: ['crew'] }, { globalRoles: ['crew', 'member'] })).toBe(false)
    expect(isNarrowerOrEqual({ globalRoles: ['crew'] }, { operationId: 'opr_roskilde' })).toBe(false)
    expect(isNarrowerOrEqual({ operationId: 'opr_roskilde' }, { operationId: 'opr_roskilde', globalRoles: ['crew'] })).toBe(true)
    expect(isNarrowerOrEqual({ operationId: 'opr_roskilde' }, { operationId: 'opr_other' })).toBe(false)
  })

  it('compares team roles through the ladder', () => {
    const parent = { minTeamRole: { kind: 'bar', role: 'bartender' } }
    expect(isNarrowerOrEqual(parent, { minTeamRole: { kind: 'bar', role: 'ba' } }, ladders)).toBe(true)
    expect(isNarrowerOrEqual(parent, { minTeamRole: { kind: 'bar', role: 'volunteer' } }, ladders)).toBe(false)
    expect(isNarrowerOrEqual(parent, { minTeamRole: { kind: 'bar', role: 'ba' } })).toBe(false)
    expect(isNarrowerOrEqual(parent, { minTeamRole: { kind: 'bar', role: 'bartender' } })).toBe(true)
    expect(isNarrowerOrEqual(parent, { minTeamRole: { kind: 'first-aid', role: 'medic' } }, ladders)).toBe(false)
  })
})

describe('visibilitySchema and parseVisibility', () => {
  it('accepts the documented shape and drops unknown keys', () => {
    expect(visibilitySchema.parse({ public: false, globalRoles: ['crew'], minTeamRole: { kind: 'bar', role: 'ba' }, operationId: 'opr_x', extra: 1 }))
      .toEqual({ public: false, globalRoles: ['crew'], minTeamRole: { kind: 'bar', role: 'ba' }, operationId: 'opr_x' })
    expect(visibilitySchema.safeParse({ minTeamRole: { kind: 'bar' } }).success).toBe(false)
  })

  it('keeps empty values empty and fails closed on a malformed value', () => {
    expect(parseVisibility(null)).toBeNull()
    expect(parseVisibility(undefined)).toBeNull()
    expect(parseVisibility({})).toEqual({})
    expect(parseVisibility({ globalRoles: 'admin' })).toEqual(NOBODY)
    expect(parseVisibility('public')).toEqual(NOBODY)
  })

  it('reports empty visibility', () => {
    expect(isEmptyVisibility(null)).toBe(true)
    expect(isEmptyVisibility({ public: false })).toBe(true)
    expect(isEmptyVisibility({ public: true })).toBe(false)
    expect(isEmptyVisibility({ globalRoles: [] })).toBe(false)
  })
})

describe('OWNER_TYPES', () => {
  it('lists the built-in owner types', () => {
    expect(OWNER_TYPES).toEqual(['operation', 'team', 'user', 'platform'])
  })
})
