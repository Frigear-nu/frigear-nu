import type { PushMessage } from '../../../../../../src/types'

// Test-only: the module exposes `sendPush` as a server util, not as a route.
export default defineEventHandler(async (event) => {
  return sendPush(event, await readBody<PushMessage>(event))
})
