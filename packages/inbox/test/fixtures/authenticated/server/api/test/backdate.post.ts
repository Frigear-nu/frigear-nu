import { z } from 'zod'
import { db, schema } from '@nuxthub/db'
import { eq } from 'drizzle-orm'

// Test-only: moves a thread's last message into the past, for the retention tests.
export default defineEventHandler(async (event) => {
  const { threadId, days } = await readValidatedBody(event, z.object({ threadId: z.string(), days: z.number() }).parse)
  await db.update(schema.inboxThreads).set({ lastMessageAt: new Date(Date.now() - days * 24 * 60 * 60 * 1000) }).where(eq(schema.inboxThreads.id, threadId))
  return { ok: true }
})
