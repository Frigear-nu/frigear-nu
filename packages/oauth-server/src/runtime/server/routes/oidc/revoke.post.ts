import { readBody } from 'h3'

// RFC 7009. Revokes a refresh token (and the rest of its family); unknown tokens are not an error.
// Access tokens are short-lived JWTs and cannot be revoked.
export default defineEventHandler(async (event) => {
  const body = (await readBody(event).catch(() => undefined)) as Record<string, unknown> | undefined
  const client = await authenticateClient(event, body)
  if (!('row' in client)) {
    if (client.basic) setResponseHeader(event, 'WWW-Authenticate', 'Basic')
    return oauthError(event, 401, 'invalid_client', 'Client authentication failed.')
  }
  const row = client.row
  if (typeof body?.token === 'string') await revokeRefreshToken(body.token, row.id)
  setResponseStatus(event, 200)
  return {}
})
