import { z } from 'zod'
import type { H3Event } from 'h3'
import { badRequest, forbidden } from '@frigear-nu/module-kit/server'
import type { OAuthApplication, OAuthUser } from '../../../types'
import { resolveScope, validateRedirectUri } from '../../utils'

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

export type ValidatedAuthorizeRequest = {
  request: AuthorizeRequest
  application: OAuthApplication
  /** The requested scopes this server knows (the defaults when none were requested). */
  scope: string[]
  /** Requested scopes this server does not know: the request is answered with `invalid_scope`. */
  unknown: string[]
}

/**
 * Validates a parsed authorization request: known, active client and an allowed redirect URI (PKCE with S256 is
 * enforced by the schema). Failures are plain HTTP errors because the redirect URI cannot be trusted yet. Unknown
 * scopes are returned (`unknown`) for the caller to redirect with `invalid_scope`, now that the redirect URI is trusted.
 */
export async function validateAuthorizeRequest(event: H3Event, request: AuthorizeRequest): Promise<ValidatedAuthorizeRequest> {
  const application = await getApplication(request.client_id)
  if (!application || !application.isActive) throw badRequest('Unknown or disabled application.')
  const valid = validateRedirectUri(request.redirect_uri, { ...application, callbackPath: useOAuthConfig().callbackPath, allowNativeRedirects: application.clientType === 'public' })
  if (!valid) throw badRequest('The redirect_uri is not allowed for this application.')

  const catalog = await getOAuthScopeCatalog(event)
  const { scope, unknown } = resolveScope(request.scope, name => isKnownOAuthScope(name, catalog))
  return { request, application, scope, unknown }
}

/** The redirect back to the application with an RFC 6749 §4.1.2.1 error (and the request's `state`). */
export function authorizeErrorRedirect(request: AuthorizeRequest, error: string, description?: string): string {
  const redirect = new URL(request.redirect_uri)
  redirect.searchParams.set('error', error)
  if (description) redirect.searchParams.set('error_description', description)
  redirect.searchParams.set('state', request.state)
  return redirect.toString()
}

/** The `invalid_scope` redirect for unknown scopes. */
export function invalidScopeRedirect(request: AuthorizeRequest, unknown: readonly string[]): string {
  return authorizeErrorRedirect(request, 'invalid_scope', `Unknown scope: ${unknown.join(' ')}`)
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
