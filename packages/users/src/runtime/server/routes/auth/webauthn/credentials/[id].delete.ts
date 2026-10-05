import { db, schema } from '@nuxthub/db'

import { and, eq } from 'drizzle-orm'

export default defineEventHandler(async (event) => {
  const { user } = await requireUserSession(event)
  const id = getRouterParam(event, 'id')

  if (!id) throw createError({ statusCode: 400, statusMessage: 'Missing credential id.' })

  await db.delete(schema.userCredentials)
    .where(and(eq(schema.userCredentials.id, id), eq(schema.userCredentials.userId, user.id)))

  return { success: true }
})
