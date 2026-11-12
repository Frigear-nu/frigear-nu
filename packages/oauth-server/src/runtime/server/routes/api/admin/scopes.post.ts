import { created } from '@frigear-nu/module-kit/server'
import { oauthScopeInputSchema, toAdminOAuthScopeDto } from '../../../utils/oauth-scopes'

// Creates a database scope: 409 `managed_by_config` for a name config or a module defines, 409 `conflict` when it
// exists, 400 for sensitive, `sessionOnly` or unknown permissions.
export default defineEventHandler(async (event) => {
  await requireOAuthAdmin(event)
  const input = await readValidatedBody(event, oauthScopeInputSchema.parse)
  return created(event, toAdminOAuthScopeDto(await createOAuthScope(input)))
})
