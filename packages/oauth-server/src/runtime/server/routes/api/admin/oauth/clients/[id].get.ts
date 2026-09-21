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

  const clients = await db
    .select({
      id: schema.oauthClients.id,
      name: schema.oauthClients.name,
      description: schema.oauthClients.description,
      icon: schema.oauthClients.icon,
      priority: schema.oauthClients.priority,
      websiteUrl: schema.oauthClients.websiteUrl,
      loginUrl: schema.oauthClients.loginUrl,
      previewUrlPattern: schema.oauthClients.previewUrlPattern,
      isActive: schema.oauthClients.isActive,
      createdAt: schema.oauthClients.createdAt,
      allowedRoles: schema.oauthClients.allowedRoles,
    })
    .from(schema.oauthClients)
    .where(eq(schema.oauthClients.id, clientId))
    .limit(1)

  const client = clients[0]
  if (!client) {
    throw createError({
      statusCode: 404,
      message: 'Client not found',
    })
  }

  return {
    ...client,
    callbackUrl: buildCallbackUrl(client.websiteUrl),
  }
})
