import { db, schema } from '@nuxthub/db'
import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { notFound } from '@frigear-nu/module-kit/server'
import { avatarField, localeField, nameField, phoneField } from '../../schemas'

const bodySchema = (locales: readonly string[]) => z.object({
  name: nameField().optional(),
  // `null` clears the avatar; leaving it out keeps it.
  avatar: avatarField().optional(),
  // `null` or an empty string clears the phone number; leaving it out keeps it.
  phone: phoneField().optional(),
  // The user's language: one of the app's i18n locales (else a short BCP-47 tag); `null` or `''` clears it.
  locale: localeField(locales).optional(),
})

export default defineEventHandler(async (event) => {
  // `profile:write` (implicit): the caller's own name, avatar, phone number and language, also through a token given
  // that scope.
  const { user, kind } = await authorize(event, 'profile:write')
  const { name, avatar, phone, locale } = await readValidatedBody(event, bodySchema(usersLocales()).parse)

  const [updated] = await db.update(schema.users)
    .set({
      ...(name !== undefined ? withUserSearchText({ name }) : {}),
      ...(avatar !== undefined ? { avatar } : {}),
      ...(phone !== undefined ? { phone } : {}),
      ...(locale !== undefined ? { locale } : {}),
      updatedAt: new Date(),
    })
    .where(eq(schema.users.id, user.id))
    .returning()

  if (!updated) throw notFound('User not found.')

  if (kind === 'session') await setUserSession(event, { user: mapUserToSession(updated) })

  return toProfileDto(updated)
})
