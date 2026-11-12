import { getQuery } from 'h3'
import { apiError } from '@frigear-nu/module-kit/server'
import type { ConsentDto } from '../../../../types'
import { parseAuthorizeRequest } from '../../utils/oauth-authorize'
import { groupScopesByService } from '../../../utils'

// Data for the consent page: which application asks for which scopes. Re-validates the whole request.
export default defineEventHandler(async (event): Promise<ConsentDto> => {
  const userId = await requireSessionUserId(event)
  // Not `getValidatedQuery`: it would replace the message naming the bad parameters with h3's generic one.
  const query = parseAuthorizeRequest(getQuery(event))
  const { application, scope: requested, unknown } = await validateAuthorizeRequest(event, query)
  // `/oauth/authorize` already sent the application `invalid_scope`; a page reached anyway has nothing to show.
  if (unknown.length) throw apiError(400, 'invalid_scope', `Unknown scope: ${unknown.join(' ')}`)
  const user = await requireOAuthUser(userId)
  await assertApplicationAccess(event, user, application)
  const authUser = await loadAuthUser(userId)
  if (!authUser) throw apiError(401, 'unauthorized', 'Unknown user.')
  // Scopes the user may not grant are shown as unavailable and left out of the code the approval issues.
  const { granted: scope, unavailable } = await filterGrantableScopes(event, authUser, requested, { application })
  const catalog = await getOAuthScopeCatalog(event)
  const scopes = getOAuthScopeDetails(scope, catalog)

  return {
    application: {
      id: application.id,
      name: application.name,
      description: application.description,
      icon: application.icon,
      websiteUrl: application.websiteUrl,
    },
    scope,
    scopes,
    // One consent for every service the application asks for: its scopes grouped by the service they belong to.
    groups: groupScopesByService(scopes),
    unavailable: getOAuthScopeDetails(unavailable, catalog),
    user: { name: user.name, email: user.email, avatar: user.avatar },
  }
})
