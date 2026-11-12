import type { H3Event } from 'h3'
import type { RequestEvent } from 'nuxt/server'
import { notFound } from '@frigear-nu/module-kit/server'
import { handleFrigearLogin } from '../../utils/frigear-login'

// `GET /auth/frigear`: "Log in with frigear.nu" (OIDC), and its callback (the redirect URI registered at frigear.nu).
// Active when `runtimeConfig.previewDeployment` is true or `runtimeConfig.frigear.sso` is configured; the configuration
// is resolved per request, so it can differ between deployments of one build.
export default eventHandler(async (event) => {
  const sso = resolveFrigearSso(event)
  if (!sso.enabled) throw notFound()
  // A callback must carry the state this browser was sent off with (nuxt-auth-utils accepts one with neither).
  if (!isOAuthCallbackStateValid(event)) return rejectOAuthCallbackState(event)
  rememberLoginRedirect(event)
  // Step-up (`?scope=users:read`) only shapes the authorization request; the callback carries no `scope`.
  const scope = frigearLoginScopes(sso, getQuery(event).scope)

  // nuxt-auth-utils 0.6 types its handlers with Nuxt's `RequestEvent`; under Nitro 2 that is this same h3 event.
  return defineOAuthOidcEventHandler({
    config: {
      clientId: sso.clientId,
      clientSecret: sso.clientSecret,
      openidConfig: sso.openidConfig,
      scope,
    },
    async onSuccess(oauthEvent, { user, tokens }) {
      return handleFrigearLogin(oauthEvent as unknown as H3Event, sso, user as Record<string, unknown>, tokens)
    },
    async onError(oauthEvent) {
      return sendRedirect(oauthEvent as unknown as H3Event, '/?error=frigear')
    },
  })(event as unknown as RequestEvent)
})
