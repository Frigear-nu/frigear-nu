// Publishes `users.locale` as the standard OIDC `locale` claim (profile scope) to applications that sign in here. Only
// registered when `@frigear-nu/oauth-server` is installed; the OAuth server itself knows nothing about the field.

/**
 * What this plugin reads and writes of oauth-server's `oauth:claims` context (its `ClaimsContext`). Typed here: the
 * OAuth server depends on this package, so this package cannot depend on it.
 */
export interface UsersOAuthClaimsContext {
  user: { locale?: unknown }
  scope: string[]
  tokenType: string
  claims: Record<string, unknown>
}

/** Adds the `locale` claim: identity claims only (access tokens stay bare), with the profile scope, never replacing one. */
export function addUserLocaleClaim(ctx: UsersOAuthClaimsContext) {
  if (ctx.tokenType === 'access_token' || !ctx.scope.includes('profile')) return
  const locale = ctx.user.locale
  if (typeof locale === 'string' && locale && !('locale' in ctx.claims)) ctx.claims.locale = locale
}

export default defineNitroPlugin((nitro) => {
  const hooks = nitro.hooks as unknown as { hook: (name: 'oauth:claims', handler: (ctx: UsersOAuthClaimsContext) => void) => void }
  hooks.hook('oauth:claims', addUserLocaleClaim)
})
