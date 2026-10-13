import { z } from 'zod'
import type { H3Event } from 'h3'
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

const fail = (statusCode: number, statusMessage: string) => createError({ statusCode, statusMessage })

/**
 * Parses and validates an authorization request: known, active client, an allowed redirect URI, PKCE
 * (S256 is mandatory) and the scopes. Failures are plain HTTP errors because the redirect URI cannot
 * be trusted to carry them yet.
 */
export async function validateAuthorizeRequest(input: unknown): Promise<{ request: AuthorizeRequest, application: OAuthApplication, scope: string[] }> {
  const parsed = authorizeRequestSchema.safeParse(input)
  if (!parsed.success) throw fail(400, `Invalid authorization request: ${parsed.error.issues.map(issue => `${issue.path.join('.')} ${issue.message}`).join(', ')}`)
  const request = parsed.data

  const application = await getApplication(request.client_id)
  if (!application || !application.isActive) throw fail(400, 'Unknown or disabled application.')
  const valid = validateRedirectUri(request.redirect_uri, { ...application, callbackPath: useOAuthConfig().callbackPath })
  if (!valid) throw fail(400, 'The redirect_uri is not allowed for this application.')

  const scope = resolveScope(request.scope, getSupportedScopes())
  if (scope.length === 0) throw fail(400, 'None of the requested scopes is supported.')
  return { request, application, scope }
}

/** Throws 403 unless the user may use the application (role check, active, `oauth:application:access`). */
export async function assertApplicationAccess(event: H3Event, user: OAuthUser, application: OAuthApplication): Promise<void> {
  const access = await checkApplicationAccess(user, application, event)
  if (!access.allowed) throw fail(403, access.reason ?? 'You do not have access to this application.')
}

/** Where to send people who are not signed in: the configured path or the `@frigear-nu/auth` login page. */
export function getSignInPath(): string {
  const config = useRuntimeConfig()
  return config.oauthServer.signInPath || getLoginPath()
}
