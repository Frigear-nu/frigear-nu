import { db, schema } from '@nuxthub/db'
import { and, eq, isNull, or } from 'drizzle-orm'
import { z } from 'zod'
import { notFound } from '@frigear-nu/module-kit/server'
import { localeField } from '../../schemas'

const bodySchema = (locales: readonly string[]) => z.object({
  locale: localeField(locales).refine(value => value !== null, { message: 'Choose a language.' }),
  // Only fill an empty language: the app's language at sign-in or on a switch never replaces one the user chose.
  ifUnset: z.boolean().optional(),
})

// `PUT /api/users/me/locale` (`profile:write`): the caller's language. With `ifUnset` it is only stored when the caller
// has none, in one conditional update, so it never overwrites a language set elsewhere in the meantime. Answers the
// profile, and refreshes a session's user.
export default defineEventHandler(async (event) => {
  const { user, kind } = await authorize(event, 'profile:write')
  const { locale, ifUnset } = await readValidatedBody(event, bodySchema(usersLocales()).parse)
  const userId = Number(user.id)

  const own = eq(schema.users.id, userId)
  await db.update(schema.users)
    .set({ locale, updatedAt: new Date() })
    .where(ifUnset ? and(own, or(isNull(schema.users.locale), eq(schema.users.locale, ''))) : own)

  const [row] = await db.select().from(schema.users).where(own).limit(1)
  if (!row) throw notFound('User not found.')
  if (kind === 'session') await setUserSession(event, { user: mapUserToSession(row) })
  return toProfileDto(row)
})
