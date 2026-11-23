import { preferenceClaims } from '../../utils/registry'

// Forwards the preferences that declared a `claim` to OAuth applications. Only registered when
// `@frigear-nu/oauth-server` is installed, and the OAuth server itself knows nothing about preferences.

/**
 * What this plugin reads and writes of oauth-server's `oauth:claims` context (its `ClaimsContext`). Typed here: the
 * packages do not depend on each other, since oauth-server's dashboard integration would make that a workspace cycle.
 */
interface OAuthClaimsContext {
  user: { preferences?: unknown }
  scope: string[]
  tokenType: string
  claims: Record<string, unknown>
}
export default defineNitroPlugin((nitro) => {
  const hooks = nitro.hooks as unknown as { hook: (name: 'oauth:claims', handler: (ctx: OAuthClaimsContext) => void) => void }
  hooks.hook('oauth:claims', (ctx) => {
    const claims = preferenceClaims(getPreferenceRegistry(), ctx.user.preferences, ctx)
    // Never replace a claim that is already there (`name`, `email`, ...); registered ones are re-applied anyway.
    for (const [name, value] of Object.entries(claims)) {
      if (!(name in ctx.claims)) ctx.claims[name] = value
    }
  })
})
