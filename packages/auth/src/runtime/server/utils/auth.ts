import type { H3Event } from 'h3'
import { apiError } from '@frigear-nu/module-kit/server'
import { resolvers } from '#auth/resolvers'
import { configured as storeConfigured } from '#auth/user-store'
import type { AuthPrincipal, AuthUser, RequireUserOptions } from '../../types'
import { looksLikeJwt, parseBearer } from '../../utils/tokens'
import { resolveCredentialPermissions } from './access'

declare module 'h3' {
  interface H3EventContext {
    /** The authenticated caller, once resolved by `getAuth`. */
    auth?: AuthPrincipal
    /** A bearer credential was presented and claimed by a resolver, but it was not valid. */
    authRejected?: boolean
  }
}

/**
 * Resolves a bearer credential. A token no resolver claims (e.g. a per-form `ffk_` token) is
 * ignored and the cookie session applies; a claimed-but-invalid token never falls back to the
 * session, so a stale or revoked token cannot silently act as whoever is logged in.
 */
export async function resolveBearer(event: H3Event): Promise<void> {
  const token = parseBearer(getRequestHeader(event, 'authorization'))
  if (!token) return
  const claimed = resolvers
    .filter(resolver => (resolver.prefix && token.startsWith(resolver.prefix)) || (resolver.jwt && looksLikeJwt(token)))
    .sort((a, b) => (a.order ?? 100) - (b.order ?? 100))
  if (!claimed.length) return

  for (const resolver of claimed) {
    const principal = await resolver.resolve(event, token)
    if (principal) {
      // A bearer credential acts within its user's current permissions. They are decided from the stored user, as for
      // a cookie session: `principal.user` went through the host's session mapper. Without a user store the
      // principal's user is all there is. With one, a principal whose user the store lacks (a host resolver's mapped
      // or forged user, or one deleted meanwhile) is refused.
      let user = principal.user
      if (storeConfigured) {
        const stored = await loadAuthUser(principal.user.id as string | number)
        if (!stored) {
          event.context.authRejected = true
          return
        }
        user = stored
      }
      // Credentials issued before permissions were frozen get their scopes within the user's permissions now.
      const resolved: AuthPrincipal = { ...principal, user }
      event.context.auth = { ...resolved, permissions: await resolveCredentialPermissions(event, resolved) }
      return
    }
  }
  event.context.authRejected = true
}

/**
 * The caller as a principal, or `null`. Bearer credentials first, then the cookie session (see `resolveAuthSession`).
 * Resolved once per request and kept on `event.context.auth`.
 */
export async function getAuth(event: H3Event): Promise<AuthPrincipal | null> {
  if (event.context.auth) return event.context.auth
  if (event.context.authRejected) return null
  // The middleware normally ran already; this keeps the helper correct when it did not (e.g. direct calls in tests).
  await resolveBearer(event)
  if (event.context.auth) return event.context.auth
  if (event.context.authRejected) return null

  const principal = await resolveAuthSession(event)
  if (principal) event.context.auth = principal
  return principal
}

const sameEmail = (a: unknown, b: unknown) =>
  typeof a !== 'string' || typeof b !== 'string' || a.trim().toLowerCase() === b.trim().toLowerCase()

/**
 * Whether the session outlived its lifetime (`runtimeConfig.session.maxAge`, in seconds; `0` is no limit), counted from
 * sign-in (`signedInAt`, stamped by `startAuthSession`). Nuxt's `useSession` reseals the cookie with a fresh ttl on
 * every write, so the seal alone would let a session that keeps being written to last forever. A session without the
 * stamp counts as expired.
 */
function authSessionExpired(event: H3Event, signedInAt: unknown) {
  const { session } = useRuntimeConfig(event) as { session?: { maxAge?: number | string } }
  const maxAge = Number(session?.maxAge) || 0
  if (maxAge <= 0) return false
  return typeof signedInAt !== 'number' || Date.now() - signedInAt > maxAge * 1000
}

/**
 * The cookie session as a principal, with the user read fresh from the store: a role change applies to the next
 * request. A session past its lifetime (counted from sign-in), whose user is gone, or whose id now belongs to someone
 * with another email (an id re-keyed by `changeId`), or whose sessions were ended since it started (`endAuthSessions`),
 * is cleared and answers `null`. Without a user store the session's snapshot is used as is, within its lifetime.
 */
export async function resolveAuthSession(event: H3Event): Promise<AuthPrincipal | null> {
  const session = await getUserSession(event)
  if (!session.user) return null
  if (authSessionExpired(event, session.signedInAt)) {
    await clearUserSession(event)
    return null
  }
  if (!storeConfigured) {
    const user = session.user as AuthUser
    return { kind: 'session', user, scopes: [] }
  }

  const stored = await useAuthUserStore().findById(session.user.id as string | number)
  // A session from before the user's sessions were ended (`endAuthSessions`, e.g. a password change) is over too.
  if (!stored || !sameEmail(stored.email, (session.user as { email?: unknown }).email) || authSessionVersionOf(stored) !== authSessionVersionOf(session)) {
    await clearUserSession(event)
    return null
  }
  // A session is no delegated credential: it has no scopes, and `authorize` checks its user's roles.
  return { kind: 'session', user: mapUserToSession(stored) as AuthUser, scopes: [] }
}

/**
 * The route entry point for "who is calling" (authentication only). Returns the caller's principal, or throws
 * 401 `unauthorized` without a valid credential, 403 `session_required` for bearer credentials when `sessionOnly` is
 * set. Check what the caller may do with `authorize(event, permission)`. The code is in `data.code` (and, for the
 * 403s, also in `data.error`, kept for existing clients).
 */
export async function requireAuth(event: H3Event, options: RequireUserOptions = {}): Promise<AuthPrincipal> {
  const principal = await getAuth(event)
  if (!principal) {
    setResponseHeader(event, 'www-authenticate', event.context.authRejected ? 'Bearer error="invalid_token"' : 'Bearer')
    throw apiError(401, 'unauthorized', 'Unauthorized')
  }
  if (options.sessionOnly && principal.kind !== 'session') {
    throw apiError(403, 'session_required', 'Forbidden', { error: 'session_required' })
  }
  return principal
}
