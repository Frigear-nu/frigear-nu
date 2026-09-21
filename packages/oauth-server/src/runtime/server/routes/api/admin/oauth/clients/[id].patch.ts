import { eq } from 'drizzle-orm'
import { db, schema } from 'hub:db'
import { authorize } from 'nuxt-authorization/utils'
import { isAdmin } from '#shared/abilities/admin'
import { FRIGEAR_SSO_CALLBACK_PATH } from '../../../../../utils/oauth'
import { userRoles } from '#shared/schema/user'

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

  const body = await readBody(event)
  const { name, description, icon, priority, websiteUrl, loginUrl, previewUrlPattern, isActive, allowedRoles, tags } = body

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

  // Build update object
  const updates: Record<string, unknown> = {}

  if (name !== undefined) {
    updates.name = name
  }

  if (description !== undefined) {
    updates.description = description
  }

  if (icon !== undefined) {
    updates.icon = icon
  }

  if (priority !== undefined) {
    updates.priority = priority
  }

  if (allowedRoles !== undefined) {
    updates.allowedRoles = (allowedRoles || []).sort((a: typeof userRoles[number], b: typeof userRoles[number]) => userRoles.indexOf(a) - userRoles.indexOf(b))
  }

  if (loginUrl !== undefined) {
    updates.loginUrl = loginUrl || null
  }

  if (websiteUrl !== undefined) {
    // Validate website URL format
    try {
      const url = new URL(websiteUrl)
      if (url.pathname !== '/' && url.pathname !== '') {
        throw createError({
          statusCode: 400,
          message: 'Website URL should not include a path. Any callback path is added automatically.',
        })
      }
    }
    catch (e) {
      if (e instanceof Error && e.message.includes('callback path')) {
        throw e
      }
      throw createError({
        statusCode: 400,
        message: `Invalid website URL: ${websiteUrl}`,
      })
    }
    // Require HTTPS (allow http://localhost for development)
    if (!requireHttps(websiteUrl)) {
      throw createError({
        statusCode: 400,
        message: 'Website URL must use HTTPS. Only http://localhost is allowed for development.',
      })
    }
    updates.websiteUrl = websiteUrl.replace(/\/$/, '')
  }

  if (previewUrlPattern !== undefined) {
    if (previewUrlPattern && !requireHttps(previewUrlPattern)) {
      throw createError({
        statusCode: 400,
        message: 'Preview URL pattern must use HTTPS. Only http://localhost is allowed for development.',
      })
    }
    updates.previewUrlPattern = previewUrlPattern || null
  }

  // Rebuild redirectUris if websiteUrl or previewUrlPattern changed
  if (updates.websiteUrl !== undefined || updates.previewUrlPattern !== undefined) {
    const finalWebsiteUrl = (updates.websiteUrl as string) || existingClients[0].websiteUrl
    const finalPreviewPattern = updates.previewUrlPattern !== undefined
      ? (updates.previewUrlPattern as string | null)
      : existingClients[0].previewUrlPattern

    const callbackUrl = buildCallbackUrl(finalWebsiteUrl)
    const redirectUris = finalPreviewPattern
      ? [callbackUrl, `${finalPreviewPattern.replace(/\/$/, '')}${FRIGEAR_SSO_CALLBACK_PATH}`]
      : [callbackUrl]
    updates.redirectUris = JSON.stringify(redirectUris)
  }

  if (isActive !== undefined) {
    updates.isActive = isActive
  }

  if (tags && Array.isArray(tags)) {
    updates.tags = tags
  }

  if (Object.keys(updates).length === 0) {
    throw createError({
      statusCode: 400,
      message: 'No fields to update',
    })
  }

  await db
    .update(schema.oauthClients)
    .set(updates)
    .where(eq(schema.oauthClients.id, clientId))

  // Fetch and return updated client
  const updatedClients = await db
    .select({
      id: schema.oauthClients.id,
      name: schema.oauthClients.name,
      description: schema.oauthClients.description,
      icon: schema.oauthClients.icon,
      priority: schema.oauthClients.priority,
      websiteUrl: schema.oauthClients.websiteUrl,
      previewUrlPattern: schema.oauthClients.previewUrlPattern,
      isActive: schema.oauthClients.isActive,
      createdAt: schema.oauthClients.createdAt,
      allowedRoles: schema.oauthClients.allowedRoles,
      tags: schema.oauthClients.tags,
    })
    .from(schema.oauthClients)
    .where(eq(schema.oauthClients.id, clientId))
    .limit(1)

  const client = updatedClients[0]!

  return {
    ...client,
    callbackUrl: buildCallbackUrl(client.websiteUrl),
  }
})
