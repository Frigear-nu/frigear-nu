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
  try {
    // `strict`: a failing `teams:roles:resolve` listener throws here rather than leaving its teams out of the list.
    const grants = await resolveAllTeamRoles(undefined, ctx.user.id, { globalRoles: ctx.roles, strict: true })
    ctx.claims.teams = teamsClaim(grants)
  }
  catch (error) {
    // Fail closed: no claim rather than a token that fails to issue or a partial list that looks complete.
    console.error('[teams] the teams claim could not be resolved; it is left out', error)
  }
}
