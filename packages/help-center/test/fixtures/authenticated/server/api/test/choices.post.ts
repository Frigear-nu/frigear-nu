import { z } from 'zod'

// Test-only: stores a user's notification channels for topics (`saveNotificationChannels` of notify, through the
// fixture's in-memory choices store), the way the account's notifications page would.
export default defineEventHandler(async (event) => {
  const { userId, topics } = await readValidatedBody(event, z.object({
    userId: z.string(),
    topics: z.record(z.string(), z.record(z.string(), z.boolean())),
  }).parse)
  await saveNotificationChannels(Number(userId), topics)
  return { ok: true }
})
