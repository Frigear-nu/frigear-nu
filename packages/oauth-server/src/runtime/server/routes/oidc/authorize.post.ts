import { z } from 'zod'
import { apiError } from '@frigear-nu/module-kit/server'
import { authorizeRequestSchema, invalidScopeRedirect } from '../../utils/oauth-authorize'

const bodySchema = authorizeRequestSchema.extend({ approved: z.boolean() })

// The consent decision. Responds with the URL the browser has to navigate to (the application's
// callback with `code` + `state`, or `error=access_denied`).
export default defineEventHandler(async (event) => {
  const userId = await requireSessionUserId(event)
  // JSON only: a form or `text/plain` body is what a cross-site page can send with the user's cookie.
  if (!/^application\/json\s*(?:;|$)/i.test(getRequestHeader(event, 'content-type') ?? '')) {
    throw apiError(415, 'unsupported_media_type', 'The consent decision must be sent as application/json.')
  }
  const { approved, ...params } = await readValidatedBody(event, bodySchema.parse)
  const { request, application, scope, unknown } = await validateAuthorizeRequest(event, params)
  if (unknown.length) return { redirectUrl: invalidScopeRedirect(request, unknown) }

  const redirect = new URL(request.redirect_uri)
  redirect.searchParams.set('state', request.state)

  if (!approved) {
    redirect.searchParams.set('error', 'access_denied')
    return { redirectUrl: redirect.toString() }
  }

  const user = await requireOAuthUser(userId)
  await assertApplicationAccess(event, user, application)
  // A scope the user may not grant (the consent page showed it as unavailable) is dropped, not refused: the
  // application gets a token without it.
  const authUser = await loadAuthUser(userId)
  if (!authUser) throw apiError(401, 'unauthorized', 'Unknown user.')
  const { granted } = await filterGrantableScopes(event, authUser, scope, { application })

  const code = await createAuthorizationCode({
    application,
    userId,
    redirectUri: request.redirect_uri,
    scope: granted,
    scopeVersions: await consentedScopeVersions(event, granted),
    codeChallenge: request.code_challenge,
    nonce: request.nonce,
  })
  redirect.searchParams.set('code', code)
  return { redirectUrl: redirect.toString() }
})
