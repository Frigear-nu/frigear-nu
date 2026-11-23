import { describe, expect, it, vi } from 'vitest'
import type { TeamRoleGrant } from '../../src/types'
import { scopeAllowsTeamsClaim, teamsClaim } from '../../src/runtime/utils/claims'

const grants: TeamRoleGrant[] = [
  { ownerType: 'operation', ownerId: 'opr_1', teamId: 'tem_a', kind: 'bar', role: 'bartender', source: 'explicit' },
  { ownerType: 'platform', ownerId: null, teamId: 'tem_b', kind: 'bar', role: 'lead', source: 'mapped' },
]

// The plugin without a server: `defineNitroPlugin` is the identity and the resolver is a stub that records its call.
const resolveAllTeamRoles = vi.fn(async () => grants)
vi.stubGlobal('defineNitroPlugin', (plugin: unknown) => plugin)
vi.stubGlobal('resolveAllTeamRoles', resolveAllTeamRoles)
const { addTeamsClaim } = await import('../../src/runtime/server/plugins/oauth-claims')

const ctx = (values: { scope: string[], tokenType?: 'id_token' | 'access_token' | 'userinfo', claims?: Record<string, unknown> }) => ({
  user: { id: 7 } as never,
  roles: ['supervisor', 'member'],
  tokenType: values.tokenType ?? 'id_token' as const,
  scope: values.scope,
  claims: values.claims ?? {},
})

describe('teams claim', () => {
  it('has one entry per grant: the team id, owner, kind, role and source', () => {
    expect(teamsClaim(grants)).toEqual([
      { id: 'tem_a', ownerType: 'operation', ownerId: 'opr_1', kind: 'bar', role: 'bartender', source: 'explicit' },
      { id: 'tem_b', ownerType: 'platform', ownerId: null, kind: 'bar', role: 'lead', source: 'mapped' },
    ])
  })

  it('needs the teams scope or teams:read', () => {
    expect(scopeAllowsTeamsClaim(['openid', 'teams'])).toBe(true)
    expect(scopeAllowsTeamsClaim(['openid', 'teams:read'])).toBe(true)
    expect(scopeAllowsTeamsClaim(['openid', 'profile', 'teams:pii'])).toBe(false)
  })

  it('adds the claim to id tokens and userinfo with the scope, resolving with the token\'s roles', async () => {
    for (const tokenType of ['id_token', 'userinfo'] as const) {
      const context = ctx({ scope: ['openid', 'teams:read'], tokenType })
      await addTeamsClaim(context)
      expect(context.claims.teams).toEqual(teamsClaim(grants))
    }
    // strict: a failing teams:roles:resolve listener makes the resolver throw, so the claim is never a partial list.
    expect(resolveAllTeamRoles).toHaveBeenCalledWith(undefined, 7, { globalRoles: ['supervisor', 'member'], strict: true })
  })

  it('leaves the claim out when the roles cannot be resolved (fail closed)', async () => {
    resolveAllTeamRoles.mockRejectedValueOnce(new Error('database down'))
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    const context = ctx({ scope: ['openid', 'teams'] })
    await expect(addTeamsClaim(context)).resolves.toBeUndefined()
    expect(context.claims).toEqual({})
    expect(error).toHaveBeenCalled()
    error.mockRestore()
  })

  it('leaves access tokens, other scopes and an existing claim alone', async () => {
    const access = ctx({ scope: ['openid', 'teams'], tokenType: 'access_token' })
    await addTeamsClaim(access)
    expect(access.claims).toEqual({})

    const noScope = ctx({ scope: ['openid', 'profile'] })
    await addTeamsClaim(noScope)
    expect(noScope.claims).toEqual({})

    const existing = ctx({ scope: ['openid', 'teams'], claims: { teams: 'kept' } })
    await addTeamsClaim(existing)
    expect(existing.claims.teams).toBe('kept')
  })
})
