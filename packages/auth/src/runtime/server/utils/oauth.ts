import type { H3Event } from 'h3'
import { handlers, settings } from '#auth/oauth'
import type { OAuthProviderButton } from '../../../types'

type OAuthProfile = Record<string, unknown>

// GitHub: avatar_url, Google: picture (a url), Facebook: picture.data.url.
function avatarOf(profile: OAuthProfile): string | undefined {
  const picture = profile.picture
  if (typeof picture === 'object' && picture !== null) {
    return ((picture as { data?: { url?: string } }).data?.url) || undefined
  }
  return (profile.avatar_url ?? picture) as string | undefined
}

// Credentials as nuxt-auth-utils reads them (`NUXT_OAUTH_<PROVIDER>_CLIENT_ID`; Steam only has an api key).
function hasCredentials(event: H3Event, provider: string) {
  const config = (useRuntimeConfig(event).oauth as Record<string, Record<string, unknown> | undefined> | undefined)?.[provider]
  return !!(config?.clientId || config?.apiKey)
}

/**
 * The nuxt-auth-utils provider behind `/api/auth/<name>` when it is on for this request: not set to `false` in
 * `authentication.settings.oauth` and configured. With `frigear` on, the shared `oidc` credentials belong to it, so the
 * plain `oidc` provider then has to be listed.
 */
export function resolveOAuthProvider(event: H3Event, name: string | undefined) {
  const key = name && Object.keys(handlers).find(provider => provider.toLowerCase() === name.toLowerCase())
  if (!key) return undefined
  const options = settings[key]
  if (options === false || !hasCredentials(event, key)) return undefined
  if (key === 'oidc' && !options && settings.frigear) return undefined
  return { key, options: options ?? {}, load: handlers[key]! }
}

/** The OAuth sign-in buttons for this request: the providers listed in settings first, in their order. */
export function listOAuthProviders(event: H3Event): OAuthProviderButton[] {
  return [...new Set([...Object.keys(settings), ...Object.keys(handlers)])].flatMap((name): OAuthProviderButton[] => {
    if (name === 'frigear') {
      const frigear = settings.frigear
      if (!frigear || !resolveFrigearSso(event).enabled) return []
      // Full page navigation: the route redirects to frigear.nu.
      return [{ key: 'frigear', to: '/auth/frigear', external: true, label: frigear.label, icon: frigear.icon }]
    }
    const provider = resolveOAuthProvider(event, name)
    if (!provider) return []
    return [{ key: provider.key, to: `/api/auth/${provider.key}`, label: provider.options.label, icon: provider.options.icon }]
  })
}

/**
 * Shared find-or-create logic for the nuxt-auth-utils OAuth providers (`GET /api/auth/<provider>`). An existing user is
 * matched by email; with `signUp: false` an unknown email is sent back to the login page instead of getting an account.
 */
export async function handleOAuthUser(event: H3Event, provider: string, profile: OAuthProfile, options: { signUp?: boolean } = {}) {
  const email = profile.email as string | undefined

  if (!email) {
    throw createError({ statusCode: 400, statusMessage: `No email returned from the ${provider} OAuth provider.` })
  }
  // Matching an unverified address would sign in to the account that owns it.
  if (profile.email_verified === false) {
    throw createError({ statusCode: 403, statusMessage: `The ${provider} account's email address is not verified.` })
  }

  const users = useAuthUserStore()

  const existing = await users.findByEmail(email)
  if (!existing && options.signUp === false) {
    const loginPath = useRuntimeConfig(event).public.authentication?.pages?.login
    return sendRedirect(event, `${isInternalPath(loginPath) ? loginPath : '/'}?error=oauth-signup`)
  }
  const user = existing ?? await users.create({
    name: (profile.name ?? profile.login ?? email) as string,
    email,
    avatar: avatarOf(profile),
  })
  const updated = await users.update(user.id, { lastLoginAt: new Date() })

  await setUserSession(event, { user: mapUserToSession(updated ?? user) })

  return sendRedirect(event, consumeLoginRedirect(event))
}
