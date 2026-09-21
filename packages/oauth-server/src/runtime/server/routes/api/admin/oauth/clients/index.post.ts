import { db, schema } from 'hub:db'
import { authorize } from 'nuxt-authorization/utils'
import { isAdmin } from '#shared/abilities/admin'
import { FRIGEAR_SSO_CALLBACK_PATH } from '../../../../../utils/oauth'
import { userRoles } from '#shared/schema/user'

export default defineEventHandler(async (event) => {
  const session = await requireUserSession(event)
  await authorize(isAdmin, session.user)

  const body = await readBody(event)
  const { name, description, icon, priority, websiteUrl, loginUrl, previewUrlPattern, allowedRoles, tags } = body

  // Validate required fields
  if (!name || !websiteUrl) {
    throw createError({
      statusCode: 400,
      message: 'Name and website URL are required',
    })
  }

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

  // Validate preview URL pattern format (if provided)
  if (previewUrlPattern) {
    if (!requireHttps(previewUrlPattern)) {
      throw createError({
        statusCode: 400,
        message: 'Preview URL pattern must use HTTPS. Only http://localhost is allowed for development.',
      })
    }
  }

  // Generate client credentials
  const clientId = generateUUID()
  const clientSecret = generateSecureToken(32)
  const secretHash = await hashToken(clientSecret)

  // Normalize website URL (remove trailing slash)
  const normalizedWebsiteUrl = websiteUrl.replace(/\/$/, '')

  // Build redirect URIs array (for backwards compatibility with DB schema)
  const callbackUrl = buildCallbackUrl(normalizedWebsiteUrl)
  const redirectUris = previewUrlPattern
    ? [callbackUrl, `${previewUrlPattern.replace(/\/$/, '')}${FRIGEAR_SSO_CALLBACK_PATH}`]
    : [callbackUrl]

  // Create the client
  await db.insert(schema.oauthClients).values({
    id: clientId,
    secretHash,
    name,
    description,
    icon,
    priority,
    websiteUrl: normalizedWebsiteUrl,
    loginUrl: loginUrl || null,
    previewUrlPattern: previewUrlPattern || null,
    redirectUris: JSON.stringify(redirectUris),
    ownerId: session.user.id,
    createdAt: new Date(),
    isActive: true,
    allowedRoles: (allowedRoles || []).sort((a: typeof userRoles[number], b: typeof userRoles[number]) => userRoles.indexOf(a) - userRoles.indexOf(b)),
    tags: tags || [],
  })

  // Return the client with the secret (only shown once)
  return {
    id: clientId,
    secret: clientSecret,
    name,
    description,
    icon,
    priority,
    websiteUrl: normalizedWebsiteUrl,
    previewUrlPattern: previewUrlPattern || null,
    callbackUrl: buildCallbackUrl(normalizedWebsiteUrl),
    createdAt: new Date().toISOString(),
    allowedRoles: allowedRoles || [],
    tags,
  }
})
