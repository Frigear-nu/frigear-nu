import type { H3Event } from 'h3'
import type { UserApplicationDto } from '../../../types'

/**
 * The applications the signed-in user may sign in to: the body of `GET /api/oauth-server/me/applications` and the
 * account bootstrap's `oauth-server:mine` (the key `useMyApplications()` reads), so both always return the same thing.
 */
export default async function myApplications(event: H3Event): Promise<UserApplicationDto[]> {
  const userId = await requireSessionUserId(event)
  return listUserApplications(userId, event)
}
