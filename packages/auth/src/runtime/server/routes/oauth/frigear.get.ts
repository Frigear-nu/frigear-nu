import { handleFrigearLogin } from '../../utils/frigear-login'

// "Log in with frigear.nu" (OIDC). Active when `runtimeConfig.previewDeployment` is true or `runtimeConfig.frigear.sso`
// is configured; the configuration is resolved per request, so it can differ between deployments of one build.
export default eventHandler(async (event) => {
  rememberLoginRedirect(event)
  const sso = resolveFrigearSso(event)
  if (!sso.enabled) {
    throw createError({ statusCode: 404, statusMessage: 'Not Found' })
  }

  return defineOAuthOidcEventHandler({
    config: {
      clientId: sso.clientId,
      clientSecret: sso.clientSecret,
      openidConfig: sso.openidConfig,
      scope: ['openid', 'profile', 'email'],
    },
    async onSuccess(event, { user, tokens }) {
      return handleFrigearLogin(event, sso, user as Record<string, unknown>, tokens.id_token as string | undefined)
    },
    async onError(event) {
      return sendRedirect(event, '/?error=frigear')
    },
  })(event)
})
