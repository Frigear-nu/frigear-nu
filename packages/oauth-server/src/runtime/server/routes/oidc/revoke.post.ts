import { z } from 'zod'

const param = z.string().max(4096).optional()

/** RFC 7009 §2.1, form encoded (JSON accepted too). */
const bodySchema = z.object({
  token: param,
  token_type_hint: param,
  client_id: param,
  client_secret: param,
})

// RFC 7009. Revokes a refresh token (and the rest of its family); unknown tokens are not an error.
// Access tokens are short-lived JWTs and cannot be revoked.
export default defineEventHandler(async (event) => {
  let body: z.infer<typeof bodySchema>
  try {
    body = await readValidatedBody(event, bodySchema.parse)
  }
  catch (error) {
    // Spec-shaped, not h3's validation error: OAuth clients read `error`.
    return oauthError(event, 400, 'invalid_request', invalidRequestDescription(error))
  }
  const client = await authenticateClient(event, body)
  if (!('row' in client)) {
    if (client.basic) setResponseHeader(event, 'WWW-Authenticate', 'Basic')
    return oauthError(event, 401, 'invalid_client', 'Client authentication failed.')
  }
  const row = client.row
  if (body.token) await revokeRefreshToken(body.token, row.id)
  setResponseStatus(event, 200)
  return {}
})
