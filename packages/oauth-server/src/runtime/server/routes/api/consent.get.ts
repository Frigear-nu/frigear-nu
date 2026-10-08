import { getQuery } from 'h3'

// Data for the consent page: which application asks for which scopes. Re-validates the whole request.
export default defineEventHandler(async (event) => {
  const userId = await requireSessionUserId(event)
  const { application, scope } = await validateAuthorizeRequest(getQuery(event))
  const user = await getOAuthUser(userId)
  if (!user) throw createError({ statusCode: 401, statusMessage: 'Unknown user.' })
  await assertApplicationAccess(event, user, application)

  return {
    application: {
      id: application.id,
      name: application.name,
      description: application.description,
      icon: application.icon,
      websiteUrl: application.websiteUrl,
    },
    scope,
    user: { name: user.name, email: user.email, avatar: user.avatar },
  }
})
