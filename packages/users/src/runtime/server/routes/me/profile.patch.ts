import { db, schema } from '@nuxthub/db'
import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { notFound } from '@frigear-nu/module-kit/server'
import { avatarField, nameField } from '../../schemas'

const bodySchema = z.object({
  name: nameField().optional(),
  // `null` clears the avatar; leaving it out keeps it.
  avatar: avatarField().optional(),
})

export default defineEventHandler(async (event) => {
  // `profile:write` (implicit): the caller's own name and avatar, also through a token given that scope.
  const { user, kind } = await authorize(event, 'profile:write')
  const { name, avatar } = await readValidatedBody(event, bodySchema.parse)

  const [updated] = await db.update(schema.users)
    .set({
      ...(name !== undefined ? { name } : {}),
      ...(avatar !== undefined ? { avatar } : {}),
      updatedAt: new Date(),
    })
    .where(eq(schema.users.id, user.id))
    .returning()

  if (!updated) throw notFound('User not found.')

  if (kind === 'session') await setUserSession(event, { user: mapUserToSession(updated) })

  return toProfileDto(updated)
})
