import type { NotifyUserInput } from '../../../../../../src/types'

// Test-only: the module exposes `notifyUser` as a server util, not as a route.
export default defineEventHandler(async (event) => {
  const { userId, ...input } = await readBody<{ userId: number } & NotifyUserInput>(event)
  return notifyUser(event, userId, input)
})
