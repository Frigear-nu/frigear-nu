import type { ClaimsContext } from '@frigear-nu/oauth-server'
import { scopeAllowsTeamsClaim, teamsClaim } from '../../utils/claims'

// Adds the `teams` claim (`[{ id, ownerType, ownerId, kind, role, source }]`) to id tokens and userinfo when the
// application was granted `teams` or `teams:read`. Only registered when `@frigear-nu/oauth-server` is installed; the
// OAuth server itself knows nothing about teams. Access tokens stay small: they never carry it.
export default defineNitroPlugin((nitro) => {
  const hooks = nitro.hooks as unknown as { hook: (name: 'oauth:claims', handler: (ctx: ClaimsContext) => Promise<void>) => void }
  hooks.hook('oauth:claims', async (ctx) => {
    await addTeamsClaim(ctx)
  })
})

/** The claim for one `oauth:claims` call; exported for tests. Never replaces a claim that is already there. */
export async function addTeamsClaim(ctx: Pick<ClaimsContext, 'user' | 'scope' | 'roles' | 'tokenType' | 'claims'>): Promise<void> {
  if (ctx.tokenType === 'access_token') return
  if (!scopeAllowsTeamsClaim(ctx.scope)) return
  if ('teams' in ctx.claims) return
  // No request here: the token endpoint resolves the claims, and `ctx.roles` already holds the user's effective roles.
  const grants = await resolveAllTeamRoles(undefined, ctx.user.id, { globalRoles: ctx.roles })
  ctx.claims.teams = teamsClaim(grants)
}
