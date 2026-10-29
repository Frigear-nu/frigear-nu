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

  const user = await requireOAuthUser(userId)
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
  return { redirectUrl: redirect.toString() }
})
