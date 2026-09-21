import { eq } from 'drizzle-orm'
import { db, schema } from '@nuxthub/db'
import { authorize } from 'nuxt-authorization/utils'
import { isAdmin } from '#shared/abilities/admin'

export default defineEventHandler(async (event) => {
  const { user } = await requireUserSession(event)
  await authorize(isAdmin, user)

  const clientId = getRouterParam(event, 'id')
  if (!clientId) {
    throw createError({
      statusCode: 400,
      message: 'Client ID is required',
    })
  }

  // Verify client exists
  const existingClients = await db
    .select()
    .from(schema.oauthClients)
    .where(eq(schema.oauthClients.id, clientId))
    .limit(1)

  if (!existingClients[0]) {
    throw createError({
      statusCode: 404,
      message: 'Client not found',
    })
  }

  // Delete related tokens and codes first
  await db.delete(schema.refreshTokens).where(eq(schema.refreshTokens.clientId, clientId))
  await db.delete(schema.authorizationCodes).where(eq(schema.authorizationCodes.clientId, clientId))

  // Delete the client
  await db.delete(schema.oauthClients).where(eq(schema.oauthClients.id, clientId))

  return { success: true }
})
