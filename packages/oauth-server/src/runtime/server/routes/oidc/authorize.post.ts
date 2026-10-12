import { z } from 'zod'
import { authorizeRequestSchema } from '../../utils/oauth-authorize'

const bodySchema = authorizeRequestSchema.extend({ approved: z.boolean() })

// The consent decision. Responds with the URL the browser has to navigate to (the application's
// callback with `code` + `state`, or `error=access_denied`).
export default defineEventHandler(async (event) => {
  const userId = await requireSessionUserId(event)
  const { approved, ...params } = await readValidatedBody(event, bodySchema.parse)
  const { request, application, scope } = await validateAuthorizeRequest(params)

  const redirect = new URL(request.redirect_uri)
  redirect.searchParams.set('state', request.state)

  if (!approved) {
    redirect.searchParams.set('error', 'access_denied')
    return { redirectUrl: redirect.toString() }
  }

  const user = await getOAuthUser(userId)
  if (!user) throw createError({ statusCode: 401, statusMessage: 'Unknown user.' })
  await assertApplicationAccess(event, user, application)

  const code = await createAuthorizationCode({
    application,
    userId,
    redirectUri: request.redirect_uri,
    scope,
    codeChallenge: request.code_challenge,
    nonce: request.nonce,
  })
  redirect.searchParams.set('code', code)
  // Lets the application theme the callback before the token exchange completes.
  if (scope.includes('profile') && typeof user.colorMode === 'string') {
    redirect.searchParams.set('color_mode', user.colorMode)
  }
  return { redirectUrl: redirect.toString() }
})
