import { db, schema } from '@nuxthub/db'

import { and, eq } from 'drizzle-orm'

export default defineEventHandler(async (event) => {
  const user = await requireUser(event, { sessionOnly: true })
  const id = getRouterParam(event, 'id')

  if (!id) throw createError({ statusCode: 400, statusMessage: 'Missing credential id.' })

  // Scoped to the session user so one account can never remove another's passkey.
  const removed = await db.delete(schema.userCredentials)
    .where(and(eq(schema.userCredentials.id, id), eq(schema.userCredentials.userId, user.id)))
    .returning({ id: schema.userCredentials.id })

  if (!removed.length) throw createError({ statusCode: 404, statusMessage: 'Passkey not found.' })

  return { success: true }
})
