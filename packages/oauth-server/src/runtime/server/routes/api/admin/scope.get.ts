import { oauthScopeNameParams } from '../../../utils/oauth-scopes'

export default defineEventHandler(async (event) => {
  await requireOAuthAdmin(event)
  const { name } = await getValidatedRouterParams(event, oauthScopeNameParams.parse)
  return requireOAuthScope(name)
})
