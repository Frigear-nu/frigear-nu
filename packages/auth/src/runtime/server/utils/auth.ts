import type { H3Event } from 'h3'
import { resolvers } from '#auth/resolvers'
import type { AuthPrincipal, RequireUserOptions } from '../../types'
import { ALL_SCOPES, hasScopes } from '../../utils/scopes'
import { looksLikeJwt, parseBearer } from '../../utils/tokens'

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
      event.context.auth = principal
      return
    }
  }
  event.context.authRejected = true
}

/** The caller as a principal, or `null`. Bearer credentials first, then the cookie session. */
export async function getAuth(event: H3Event): Promise<AuthPrincipal | null> {
  if (event.context.auth) return event.context.auth
  if (event.context.authRejected) return null
  // The middleware normally ran already; this keeps the helper correct when it did not (e.g. direct calls in tests).
  await resolveBearer(event)
  if (event.context.auth) return event.context.auth
  if (event.context.authRejected) return null

  const session = await getUserSession(event)
  if (!session.user) return null
  const principal: AuthPrincipal = { kind: 'session', user: session.user, scopes: [ALL_SCOPES] }
  event.context.auth = principal
  return principal
}

/**
 * The route entry point for "who is calling". Returns the caller's principal, or throws:
 * 401 without a valid credential, 403 `session_required` for bearer credentials when
 * `sessionOnly` is set, 403 `insufficient_scope` when a required scope is missing.
 */
export async function requireAuth(event: H3Event, options: RequireUserOptions = {}): Promise<AuthPrincipal> {
  const principal = await getAuth(event)
  if (!principal) {
    setResponseHeader(event, 'www-authenticate', event.context.authRejected ? 'Bearer error="invalid_token"' : 'Bearer')
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }
  if (options.sessionOnly && principal.kind !== 'session') {
    throw createError({ statusCode: 403, statusMessage: 'Forbidden', data: { error: 'session_required' } })
  }
  if (options.scopes?.length && !hasScopes(principal.scopes, options.scopes)) {
    setResponseHeader(event, 'www-authenticate', `Bearer error="insufficient_scope", scope="${options.scopes.join(' ')}"`)
    throw createError({ statusCode: 403, statusMessage: 'Forbidden', data: { error: 'insufficient_scope', scopes: options.scopes } })
  }
  return principal
}

/**
 * The caller's user when there is one, otherwise `null` (never throws). For routes that are open
 * to everyone but personalise for a signed-in user. A bearer credential missing the required
 * `scopes` counts as anonymous.
 */
export async function getAuthUser(event: H3Event, options: Pick<RequireUserOptions, 'scopes'> = {}) {
  const principal = await getAuth(event)
  if (!principal) return null
  return !options.scopes?.length || hasScopes(principal.scopes, options.scopes) ? principal.user : null
}

/** Like `requireAuth`, returning just the user. */
export async function requireUser(event: H3Event, options: RequireUserOptions = {}) {
  return (await requireAuth(event, options)).user
}
