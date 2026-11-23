import { db, schema } from '@nuxthub/db'
import { eq } from 'drizzle-orm'
import { z } from 'zod'

// Test-only: stores a mailbox's grants as they are, past the checks of the routes (a list stored before a kind was refused).
export default defineEventHandler(async (event) => {
  const { id, grants } = await readValidatedBody(event, z.object({ id: z.string(), grants: z.array(z.record(z.string(), z.unknown())) }).parse)
  await db.update(schema.inboxMailboxes).set({ grants }).where(eq(schema.inboxMailboxes.id, id))
  return { ok: true }
})
