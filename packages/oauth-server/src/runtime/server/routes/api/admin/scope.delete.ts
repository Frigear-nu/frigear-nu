import { noContent } from '@frigear-nu/module-kit/server'
import { oauthScopeNameParams } from '../../../utils/oauth-scopes'

// Deletes a database scope. Clients asking for it get `invalid_scope`; existing sign-ins lose it at their next refresh.
export default defineEventHandler(async (event) => {
  await requireOAuthAdmin(event)
  const { name } = await getValidatedRouterParams(event, oauthScopeNameParams.parse)
  await deleteOAuthScope(name)
  return noContent(event)
})
