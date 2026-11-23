import { db, schema } from '@nuxthub/db'
import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { apiError, notFound } from '@frigear-nu/module-kit/server'
import type { PreferencesDto } from '../../../types'
import { applyPreferencePatch, managedPreferenceKeys, parsePreferencePatch } from '../../utils/registry'

const objectSchema = z.record(z.string(), z.unknown())

// `PATCH /api/preferences` (session only): partial update of the signed-in user's preferences. `{ colorMode: 'dark' }`
// sets, `{ colorMode: null }` clears; keys must be registered and values must satisfy their schema. A `managed` key
// (the notification channels) is refused with 400 `preference_managed`: it changes only through its module's own route.
// Answers with the stored preferences.
export default defineEventHandler(async (event): Promise<PreferencesDto> => {
  const user = await requireUser(event, { sessionOnly: true })
  const registry = getPreferenceRegistry()
  const managed = managedPreferenceKeys(registry, await readValidatedBody(event, objectSchema.parse))
  if (managed.length) {
    throw apiError(400, 'preference_managed', `Change ${managed.join(', ')} through its own route, not PATCH /api/preferences.`, { keys: managed })
  }
  const patch = await readValidatedBody(event, body => parsePreferencePatch(registry, body))

  const [current] = await db.select({ preferences: schema.users.preferences })
    .from(schema.users)
    .where(eq(schema.users.id, user.id))
    .limit(1)
  if (!current) throw notFound('User not found.')

  const preferences = applyPreferencePatch(current.preferences, patch)

  const [updated] = await db.update(schema.users)
    .set({ preferences })
    .where(eq(schema.users.id, user.id))
    .returning()
  if (!updated) throw notFound('User not found.')

  // Replaced, not merged: `setUserSession` deep-merges, which would keep a cleared key (and a `managed` one an older
  // session still carries) in the cookie.
  const { id: _id, ...session } = await getUserSession(event)
  await replaceUserSession(event, { ...session, user: mapUserToSession(updated) })

  return preferences as PreferencesDto
})
