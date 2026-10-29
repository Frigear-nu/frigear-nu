import { db, schema } from '@nuxthub/db'
import { eq } from 'drizzle-orm'
import { notFound } from '@frigear-nu/module-kit/server'
import type { PreferencesDto } from '../../../types'
import { applyPreferencePatch, parsePreferencePatch } from '../../utils/registry'

// `PATCH /api/preferences` (session only): partial update of the signed-in user's preferences. `{ colorMode: 'dark' }`
// sets, `{ colorMode: null }` clears; keys must be registered and values must satisfy their schema. Answers with the
// stored preferences.
export default defineEventHandler(async (event): Promise<PreferencesDto> => {
  const user = await requireUser(event, { sessionOnly: true })
  const patch = await readValidatedBody(event, body => parsePreferencePatch(getPreferenceRegistry(), body))

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

  await setUserSession(event, { user: mapUserToSession(updated) })

  return preferences as PreferencesDto
})
