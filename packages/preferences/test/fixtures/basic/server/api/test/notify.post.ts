import type { NotifyUserInput } from '@frigear-nu/notify/types'

// Test-only: notify exposes `notifyUser` as a server util, not as a route.
export default defineEventHandler(async (event) => {
  const { userId, ...input } = await readBody<{ userId: number } & NotifyUserInput>(event)
  return notifyUser(userId, input)
})
