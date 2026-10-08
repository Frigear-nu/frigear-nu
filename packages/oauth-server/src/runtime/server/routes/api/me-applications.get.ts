import type { UserApplicationDto } from '../../../../types'

// The applications the signed-in user may sign in to.
export default defineEventHandler(async (event): Promise<UserApplicationDto[]> => {
  const userId = await requireSessionUserId(event)
  return listUserApplications(userId, event)
})
