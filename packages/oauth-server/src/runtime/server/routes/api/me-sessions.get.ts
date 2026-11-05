import type { OAuthSessionDto } from '../../../../types'

// `GET /api/oauth-server/me/sessions`: the applications the caller is signed in to, one entry per sign-in.
export default defineEventHandler(async (event): Promise<OAuthSessionDto[]> => {
  const userId = await requireSessionUserId(event)
  return listUserOAuthSessions(userId)
})
