import { db, schema } from '@nuxthub/db'
import { eq } from 'drizzle-orm'
import { parsePreferencePatch } from '../../utils/registry'

// Partial update of the signed-in user's preferences: `{ colorMode: 'dark' }` sets, `{ colorMode: null }` clears.
// Keys must be registered and values must satisfy their schema. Responds with the resulting preferences.
export default defineEventHandler(async (event) => {
  const user = await requireUser(event, { sessionOnly: true })
  const patch = parsePreferencePatch(getPreferenceRegistry(), await readBody(event))
  if (!patch.ok) throw createError({ statusCode: 400, statusMessage: patch.message })

  const [current] = await db.select({ preferences: schema.users.preferences })
    .from(schema.users)
    .where(eq(schema.users.id, user.id))
    .limit(1)
  if (!current) throw createError({ statusCode: 404, statusMessage: 'User not found.' })

  const preferences = Object.fromEntries(
    Object.entries({ ...current.preferences, ...patch.set }).filter(([key]) => !patch.remove.includes(key)),
  )

  const [updated] = await db.update(schema.users)
    .set({ preferences })
    .where(eq(schema.users.id, user.id))
    .returning()
  if (!updated) throw createError({ statusCode: 404, statusMessage: 'User not found.' })

  await setUserSession(event, { user: mapUserToSession(updated) })

  return preferences
})
