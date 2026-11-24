import type { OAuthScopePermissionOptionDto } from '../../../../../types'
import { listOAuthScopePermissionOptions } from '../../../utils/oauth-scopes'

// The permissions a database scope may carry, for the scope form's picker: never sensitive or session-only ones (the
// same rule `POST`/`PATCH` scopes validate with). Bounded by the registry, so not paginated.
export default defineEventHandler(async (event): Promise<OAuthScopePermissionOptionDto[]> => {
  await requireOAuthAdmin(event)
  return listOAuthScopePermissionOptions()
})
