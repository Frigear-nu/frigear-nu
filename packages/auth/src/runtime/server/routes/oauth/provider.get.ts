import type { H3Event } from 'h3'
import { z } from 'zod'
import { notFound } from '@frigear-nu/module-kit/server'

// Optional: a request whose method has no route of its own at a static path (`GET /api/auth/logout`) falls back to
// this route without router params, and is a plain 404, not a validation error.
const paramsSchema = z.object({ provider: z.string().trim().min(1).optional() })

// `GET /api/auth/<provider>`: OAuth sign-in through the nuxt-auth-utils provider of that name, once its credentials are
// set (`NUXT_OAUTH_<PROVIDER>_*`). The same route receives the provider's callback (the redirect URI registered at the
// provider), so its path never changes.
export default eventHandler(async (event) => {
  const { provider: name } = await getValidatedRouterParams(event, paramsSchema.parse)
  const provider = resolveOAuthProvider(event, name)
  if (!provider) throw notFound()

  rememberLoginRedirect(event)
  const defineHandler = await provider.load()
  return defineHandler({
    config: { emailRequired: true, ...provider.options.config },
    async onSuccess(event: H3Event, { user }: { user: Record<string, unknown> }) {
      return handleOAuthUser(event, provider.key, user, { signUp: provider.options.signUp })
    },
  })(event)
})
