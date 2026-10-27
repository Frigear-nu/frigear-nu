import type { H3Event } from 'h3'

// `GET /api/auth/<provider>`: OAuth sign-in through the nuxt-auth-utils provider of that name, once its credentials are
// set (`NUXT_OAUTH_<PROVIDER>_*`). The same route receives the provider's callback.
export default eventHandler(async (event) => {
  const provider = resolveOAuthProvider(event, getRouterParam(event, 'provider'))
  if (!provider) {
    throw createError({ statusCode: 404, statusMessage: 'Not Found' })
  }

  rememberLoginRedirect(event)
  const defineHandler = await provider.load()
  return defineHandler({
    config: { emailRequired: true, ...provider.options.config },
    async onSuccess(event: H3Event, { user }: { user: Record<string, unknown> }) {
      return handleOAuthUser(event, provider.key, user, { signUp: provider.options.signUp })
    },
  })(event)
})
