import { db, schema } from '@nuxthub/db'
import { and, eq } from 'drizzle-orm'
import { idParams, noContent, notFound } from '@frigear-nu/module-kit/server'

// `DELETE /api/auth/me/passkeys/:id` (session only): removes one of the caller's passkeys. 204.
export default defineEventHandler(async (event) => {
  const { user } = await requireAuth(event, { sessionOnly: true })
  const { id } = await getValidatedRouterParams(event, idParams().parse)

  // Scoped to the session user so one account can never remove another's passkey.
  const removed = await db.delete(schema.userCredentials)
    .where(and(eq(schema.userCredentials.id, id), eq(schema.userCredentials.userId, user.id)))
    .returning({ id: schema.userCredentials.id })

  if (!removed.length) throw notFound('Passkey not found.')

  return noContent(event)
})
