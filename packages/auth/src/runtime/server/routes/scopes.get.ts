import type { AuthScopeDto } from '../../../types'
import { ANY_PERMISSION } from '../../utils/permissions'
import { namedScopes, registry } from '#auth/permissions'

// `GET /api/auth/scopes` (session only): the scopes the caller may give a token (`canGrantScope`), full access first,
// then the named scopes, then the permissions. Resource wildcards (`events:*`) are accepted when minting, not listed.
export default defineEventHandler(async (event): Promise<AuthScopeDto[]> => {
  await requireAuth(event, { sessionOnly: true })
  const result: AuthScopeDto[] = []
  const offer = async (scope: AuthScopeDto) => {
    if (await canGrantScope(event, scope.name, { wildcardScopes: true })) result.push(scope)
  }
  await offer({ name: ANY_PERMISSION, description: 'Full access: everything you can do, except the sensitive permissions (such as :pii), which must be chosen by name.' })
  for (const scope of Object.values(namedScopes)) {
    await offer({ name: scope.name, label: scope.label, labelKey: scope.labelKey, description: scope.description, descriptionKey: scope.descriptionKey })
  }
  for (const permission of Object.values(registry.permissions)) {
    if (permission.sessionOnly) continue
    await offer({ name: permission.name, label: permission.label, labelKey: permission.labelKey, description: permission.description, descriptionKey: permission.descriptionKey })
  }
  return result
})
