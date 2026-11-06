import type { H3Event } from 'h3'
import { apiError } from '@frigear-nu/module-kit/server'
import { handlers, settings } from '#auth/oauth'
import type { OAuthProviderButton } from '../../../types'
import { authApi } from '../../utils/api'

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

/** The scopes a provider's login asks for (`config.scope`), standing in when its token response names none. */
function requestedScopes(provider: string): string[] {
  const options = settings[provider]
  const scope = options ? options.config?.scope : undefined
  return Array.isArray(scope) ? scope.filter((item): item is string => typeof item === 'string') : typeof scope === 'string' ? scope.split(/[\s,]+/).filter(Boolean) : []
}

/** The OAuth sign-in buttons for this request: the providers listed in settings first, in their order. */
export function listOAuthProviders(event: H3Event): OAuthProviderButton[] {
  return [...new Set([...Object.keys(settings), ...Object.keys(handlers)])].flatMap((name): OAuthProviderButton[] => {
    if (name === 'frigear') {
      const frigear = settings.frigear
      if (!frigear || !resolveFrigearSso(event).enabled) return []
      // Full page navigation: the route redirects to frigear.nu.
      return [{ key: 'frigear', to: authApi.frigear, external: true, label: frigear.label, icon: frigear.icon }]
    }
    const provider = resolveOAuthProvider(event, name)
    if (!provider) return []
    return [{ key: provider.key, to: authApi.provider(provider.key), label: provider.options.label, icon: provider.options.icon }]
  })
}

/**
 * Whether the provider vouches that the profile's email belongs to whoever signed in: only a positive flag counts.
 * Google and OIDC providers send `email_verified` (Cognito and Apple as the string `'true'`), Google's older endpoint
 * `verified_email`, Discord `verified`. GitHub only shows verified addresses as the public email, and nuxt-auth-utils
 * sets `email_verified` when it reads the primary address instead. Providers without a flag (Facebook, Microsoft,
 * Spotify, ...) are not trusted unless the host sets `trustEmail` for them.
 */
export function isOAuthEmailVerified(provider: string, profile: OAuthProfile, options: { trustEmail?: boolean } = {}): boolean {
  if (options.trustEmail === true) return true
  const flag = (value: unknown) => value === true || value === 'true'
  switch (provider.toLowerCase()) {
    case 'discord':
      return flag(profile.verified)
    case 'google':
      return flag(profile.email_verified) || flag(profile.verified_email)
    case 'github':
      return profile.email_verified === undefined ? typeof profile.email === 'string' : flag(profile.email_verified)
    default:
      return flag(profile.email_verified)
  }
}

/** Sends a failed sign-in back to the login page with `?error=<code>`, which explains it. */
export function authLoginErrorRedirect(event: H3Event, error: 'oauth-signup' | 'oauth-unverified') {
  const loginPath = useRuntimeConfig(event).public.authentication?.pages?.login
  return sendRedirect(event, `${isInternalPath(loginPath) ? loginPath : '/'}?error=${error}`)
}

/**
 * Shared find-or-create logic for the nuxt-auth-utils OAuth providers (`GET /api/auth/<provider>`). An existing user is
 * matched by email, and only when the provider vouches for the address (`isOAuthEmailVerified`); otherwise the user is
 * sent back to the login page with `?error=oauth-unverified` and nothing is linked or created. A new account gets the
 * address as verified. An account that was never verified loses the credentials set before (whoever registered it may
 * not own the address). With `signUp: false` an unknown email is sent back to the login page instead of getting an
 * account. `tokens` (the token response, for providers with `keepTokens`) are kept for the user.
 */
export async function handleOAuthUser(event: H3Event, provider: string, profile: OAuthProfile, options: { signUp?: boolean, trustEmail?: boolean, tokens?: Record<string, unknown> } = {}) {
  const email = typeof profile.email === 'string' ? profile.email.trim().toLowerCase() || undefined : undefined

  if (!email) {
    throw apiError(400, 'email_missing', `No email returned from the ${provider} OAuth provider.`)
  }
  // Matching (or claiming) an address the provider has not verified would sign in to the account that owns it.
  if (!isOAuthEmailVerified(provider, profile, { trustEmail: options.trustEmail })) {
    return authLoginErrorRedirect(event, 'oauth-unverified')
  }

  const users = useAuthUserStore()

  const existing = await users.findByEmail(email)
  if (!existing && options.signUp === false) {
    return authLoginErrorRedirect(event, 'oauth-signup')
  }
  if (existing && !existing.emailVerifiedAt) await clearUnverifiedAuthCredentials(existing.id, event)

  const now = new Date()
  const user = existing ?? await users.create({
    name: (profile.name ?? profile.login ?? email) as string,
    email,
    avatar: avatarOf(profile),
    emailVerifiedAt: now,
  })
  const updated = await users.update(user.id, { lastLoginAt: now, ...(!user.emailVerifiedAt && { emailVerifiedAt: now }) })
  if (options.tokens) await storeOAuthTokens(user.id, provider, parseOAuthTokenResponse(options.tokens, requestedScopes(provider)))

  await setUserSession(event, { user: mapUserToSession(updated ?? user) })

  return sendRedirect(event, consumeLoginRedirect(event))
}
