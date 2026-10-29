import type { AuthTokenDto } from '../../../../types'

// `GET /api/auth/me/tokens` (session only): the caller's API tokens, newest first, revoked ones included.
export default defineEventHandler(async (event): Promise<AuthTokenDto[]> => {
  const { user } = await requireAuth(event, { sessionOnly: true })
  return (await listUserTokens(String(user.id))).map(toTokenDto)
})
