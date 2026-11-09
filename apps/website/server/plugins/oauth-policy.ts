// Host conditions for `@frigear-nu/oauth-server`. The role decides who manages applications (`oauth:manage`: admins,
// see `authorization.roles`); a verified email on the NUXT_OAUTH_ADMIN_EMAILS allowlist may too (`isAllowlisted`).
// Applications with `allowedRoles` stay closed until `oauth:user:roles` is implemented.
import { isAllowlisted } from '#shared/acl'

export default defineNitroPlugin((nitro) => {
  // Applications that sign people in with frigear.nu (the other Frigear apps) map this to their own users, so an admin
  // here is an admin there. Identity claims only: access tokens stay bare.
  nitro.hooks.hook('oauth:claims', (ctx) => {
    if (ctx.tokenType !== 'access_token' && ctx.scope.includes('profile')) ctx.claims.role = effectiveRole(ctx.user)
  })

  nitro.hooks.hook('oauth:authorize', async (ctx) => {
    if (ctx.allowed) return
    const user = await getOAuthUser(ctx.userId)
    ctx.allowed = !!user && isAllowlisted(user, staffAllowlists().oauthAdmins)
  })
})
