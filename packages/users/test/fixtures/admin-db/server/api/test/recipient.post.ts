import { db, schema } from '@nuxthub/db'
import { eq } from 'drizzle-orm'
import { z } from 'zod'
import recipients from '../../../../../../src/runtime/server/notify-recipients'

// Test-only: what notify's recipient store (registered by this module) answers for the user with this email.
export default defineEventHandler(async (event) => {
  const { email } = await readValidatedBody(event, z.object({ email: z.string() }).parse)
  const [row] = await db.select({ id: schema.users.id }).from(schema.users).where(eq(schema.users.email, email))
  return row ? await recipients.findRecipient(row.id) : null
})
