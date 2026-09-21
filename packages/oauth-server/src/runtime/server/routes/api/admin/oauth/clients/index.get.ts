import { eq } from 'drizzle-orm'
import { db, schema } from '@nuxthub/db'
import { authorize } from 'nuxt-authorization/utils'
import { isAdmin } from '#shared/abilities/admin'

export default defineEventHandler(async (event) => {
  const { user } = await requireUserSession(event)
  await authorize(isAdmin, user)

  // Get all clients with owner information
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
      ownerName: schema.users.name,
    })
    .from(schema.oauthClients)
    .leftJoin(schema.users, eq(schema.oauthClients.ownerId, schema.users.id))

  return clients.map(client => ({
    ...client,
    callbackUrl: buildCallbackUrl(client.websiteUrl),
  }))
})
