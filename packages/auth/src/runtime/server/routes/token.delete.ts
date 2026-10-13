import { and, eq, isNull } from 'drizzle-orm'
import { db, schema } from '@nuxthub/db'

export default defineEventHandler(async (event) => {
  const { user } = await requireAuth(event, { sessionOnly: true })
  const id = getRouterParam(event, 'id')
  const existing = id ? await findUserToken(String(user.id), id) : undefined
  if (!existing) throw createError({ statusCode: 404, statusMessage: 'Token not found' })

  // Kept (not deleted) for the audit trail; resolution rejects revoked rows.
  await db.update(schema.authUserTokens).set({ revokedAt: new Date() })
    .where(and(eq(schema.authUserTokens.id, existing.id), isNull(schema.authUserTokens.revokedAt)))
  return { ok: true }
})
