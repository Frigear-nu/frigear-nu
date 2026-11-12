import { oauthScopeNameParams, oauthScopePatchSchema, toAdminOAuthScopeDto } from '../../../utils/oauth-scopes'

// Updates a database scope; its `version` is bumped when its permissions grow, so users consent again.
export default defineEventHandler(async (event) => {
  await requireOAuthAdmin(event)
  const { name } = await getValidatedRouterParams(event, oauthScopeNameParams.parse)
  const patch = await readValidatedBody(event, oauthScopePatchSchema.parse)
  return toAdminOAuthScopeDto(await updateOAuthScope(name, patch))
})
