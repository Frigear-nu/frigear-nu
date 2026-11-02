import { readBody } from 'h3'

// A fake token endpoint: rotates `refresh-1` into `refresh-2`, refuses anything else.
export default defineEventHandler(async (event) => {
  const body = new URLSearchParams(await readBody<string>(event))
  const g = globalThis as { __refreshes?: number }
  g.__refreshes = (g.__refreshes ?? 0) + 1
  if (body.get('grant_type') !== 'refresh_token' || body.get('refresh_token') !== 'refresh-1'
    || body.get('client_id') !== 'kept-client' || body.get('client_secret') !== 'kept-secret') {
    throw createError({ statusCode: 400, statusMessage: 'invalid_grant' })
  }
  return { access_token: 'access-2', refresh_token: 'refresh-2', expires_in: 3600, token_type: 'Bearer' }
})
