import { z } from 'zod'
import type { H3Event } from 'h3'
import { badRequest, forbidden } from '@frigear-nu/module-kit/server'
import type { OAuthApplication, OAuthUser } from '../../../types'
import { resolveScope, validateRedirectUri } from '../../utils'
import { scopes as apiScopes } from '#auth/scopes'

/** The authorization request parameters (query on GET, body on POST). */
export const authorizeRequestSchema = z.object({
  client_id: z.string().min(1),
  redirect_uri: z.string().min(1),
  response_type: z.literal('code'),
  state: z.string().min(1).max(2048),
  code_challenge: z.string().min(43).max(128),
  code_challenge_method: z.literal('S256'),
  scope: z.string().max(1024).optional(),
  nonce: z.string().max(512).optional(),
})

export type AuthorizeRequest = z.infer<typeof authorizeRequestSchema>

/**
 * Parses the authorization request parameters (a query or a body). Failures are a
 * plain 400 `bad_request` naming the bad parameters, because the redirect URI cannot be trusted to carry them yet.
 */
export function parseAuthorizeRequest(input: unknown): AuthorizeRequest {
  const parsed = authorizeRequestSchema.safeParse(input)
  if (!parsed.success) throw badRequest(`Invalid authorization request: ${parsed.error.issues.map(issue => `${issue.path.join('.')} ${issue.message}`).join(', ')}`)
  return parsed.data
}

/**
 * Validates a parsed authorization request: known, active client, an allowed redirect URI and the scopes (PKCE with
 * S256 is enforced by the schema). Failures are plain HTTP errors because the redirect URI cannot be trusted yet.
 */
export async function validateAuthorizeRequest(request: AuthorizeRequest): Promise<{ request: AuthorizeRequest, application: OAuthApplication, scope: string[] }> {
  const application = await getApplication(request.client_id)
  if (!application || !application.isActive) throw badRequest('Unknown or disabled application.')
  const valid = validateRedirectUri(request.redirect_uri, { ...application, callbackPath: useOAuthConfig().callbackPath, allowNativeRedirects: application.clientType === 'public' })
  if (!valid) throw badRequest('The redirect_uri is not allowed for this application.')

  const scope = resolveScope(request.scope, getSupportedScopes())
  if (scope.length === 0) throw badRequest('None of the requested scopes is supported.')
  return { request, application, scope }
}

// The host's staff gate for `staffOnly` scopes; the scope is merged into the hook context.
const staffScopeGate = definePolicyGate<{ scope: string }>('oauth:scope:staff')

/**
 * The scopes of `scope` the user may be granted. An API scope a module registered with `@frigear-nu/auth` is kept
 * only when the user may hold it (its `roles`, the `auth:scope-available` hook: e.g. `users:read` is staff only);
 * a `staffOnly` scope of the registry only when the `oauth:scope:staff` hook allows the user. OIDC and other
 * registry scopes pass. A plain user asking for a staff scope gets a token without it.
 */
export async function filterGrantableScopes(event: H3Event, user: OAuthUser, scope: string[]): Promise<string[]> {
  const registered = new Set(apiScopes.map(definition => definition.name))
  const staffOnly = new Set(getOAuthScopeRegistry().filter(definition => definition.staffOnly).map(definition => definition.name))
  const available = scope.some(name => registered.has(name))
    ? new Set((await availableScopes(event, user as OAuthUser & { role?: string })).map(definition => definition.name))
    : new Set<string>()

  const granted: string[] = []
  for (const name of scope) {
    if (registered.has(name) && !available.has(name)) continue
    if (staffOnly.has(name) && !(await staffScopeGate.isAllowed(event, user.id, { scope: name }))) continue
    granted.push(name)
  }
  return granted
}

/** Throws 403 unless the user may use the application (role check, active, `oauth:application:access`). */
export async function assertApplicationAccess(event: H3Event, user: OAuthUser, application: OAuthApplication): Promise<void> {
  const access = await checkApplicationAccess(user, application, event)
  if (!access.allowed) throw forbidden(access.reason ?? 'You do not have access to this application.')
}

/** Where to send people who are not signed in: the configured path or the `@frigear-nu/auth` login page. */
export function getSignInPath(): string {
  const config = useRuntimeConfig()
  return config.oauthServer.signInPath || getLoginPath()
}
