import { and, eq, isNull } from 'drizzle-orm'
import { db, schema } from '@nuxthub/db'
import { idParams, noContent, notFound } from '@frigear-nu/module-kit/server'

// `DELETE /api/auth/me/tokens/:id` (session only): revokes one of the caller's tokens. 204.
export default defineEventHandler(async (event) => {
  const { user } = await requireAuth(event, { sessionOnly: true })
  const { id } = await getValidatedRouterParams(event, idParams().parse)
  const existing = await findUserToken(String(user.id), id)
  if (!existing) throw notFound('Token not found.')

  // Kept (not deleted) for the audit trail; resolution rejects revoked rows.
  await db.update(schema.authUserTokens).set({ revokedAt: new Date() })
    .where(and(eq(schema.authUserTokens.id, existing.id), isNull(schema.authUserTokens.revokedAt)))
  return noContent(event)
})
