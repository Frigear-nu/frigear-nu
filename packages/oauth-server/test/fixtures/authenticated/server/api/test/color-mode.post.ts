import { db, schema } from '@nuxthub/db'
import { eq } from 'drizzle-orm'

// Sets the stored color mode of the signed-in user, as the account module does in the real app.
export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  const { colorMode } = await readBody<{ colorMode: string }>(event)
  await db.update(schema.users).set({ colorMode }).where(eq(schema.users.id, user.id))
  return { colorMode }
})
