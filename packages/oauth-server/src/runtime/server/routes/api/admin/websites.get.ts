import { eq } from 'drizzle-orm'
import { db, schema } from '@nuxthub/db'
import { authorize } from 'nuxt-authorization/utils'
import { isAdmin } from '#shared/abilities/admin'

/**
 * Public endpoint that returns the list of websites where users can log in
 */
export default defineEventHandler(async (event) => {
  const { user } = await requireUserSession(event)

  await authorize(isAdmin, user)

  // Get all active clients (public info only - no secrets)
  const clients = await db
    .select({
      name: schema.oauthClients.name,
      websiteUrl: schema.oauthClients.websiteUrl,
      loginUrl: schema.oauthClients.loginUrl,
    })
    .from(schema.oauthClients)
    .where(eq(schema.oauthClients.isActive, true))

  return clients
})
