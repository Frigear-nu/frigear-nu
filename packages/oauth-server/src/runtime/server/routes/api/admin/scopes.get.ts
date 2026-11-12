import type { AdminOAuthScopeDto } from '../../../../../types'
import { listManagedOAuthScopes, toAdminOAuthScopeDto } from '../../../utils/oauth-scopes'

// Every named scope: the read-only ones of config and modules (`managed`), then the database ones. A small, bounded
// list, so not paginated.
export default defineEventHandler(async (event): Promise<AdminOAuthScopeDto[]> => {
  await requireOAuthAdmin(event)
  const managed = listManagedOAuthScopes()
  const names = new Set(managed.map(scope => scope.name))
  const stored = (await listOAuthDbScopes()).filter(scope => !names.has(scope.name)).map(toAdminOAuthScopeDto)
  return [...managed, ...stored]
})
