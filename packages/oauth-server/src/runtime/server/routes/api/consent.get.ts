import { getQuery } from 'h3'
import type { ConsentDto } from '../../../../types'
import { parseAuthorizeRequest } from '../../utils/oauth-authorize'

// Data for the consent page: which application asks for which scopes. Re-validates the whole request.
export default defineEventHandler(async (event): Promise<ConsentDto> => {
  const userId = await requireSessionUserId(event)
  // Not `getValidatedQuery`: it would replace the message naming the bad parameters with h3's generic one.
  const query = parseAuthorizeRequest(getQuery(event))
  const { application, scope } = await validateAuthorizeRequest(query)
  const user = await requireOAuthUser(userId)
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
    scopes: getOAuthScopeDetails(scope),
    user: { name: user.name, email: user.email, avatar: user.avatar },
  }
})
