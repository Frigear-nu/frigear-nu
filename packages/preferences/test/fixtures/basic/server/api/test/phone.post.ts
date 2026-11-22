import { db, schema } from '@nuxthub/db'
import { eq } from 'drizzle-orm'
import { z } from 'zod'

const bodySchema = z.object({ email: z.string(), phone: z.string().nullable() })

// Test-only: sets the phone number (`users.phone` of `@frigear-nu/users`) and answers the user's id.
export default defineEventHandler(async (event) => {
  const { email, phone } = await readValidatedBody(event, bodySchema.parse)
  const [user] = await db.update(schema.users).set({ phone }).where(eq(schema.users.email, email)).returning()
  return { id: user?.id }
})
