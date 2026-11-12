import type { AuthorizationPermissionsDto } from '../../../../types'

// `GET /api/authorization/me/permissions`: the caller's role and what it may do. Without `rbac`, `role` is `null` and
// the permissions are `['*']` (no access control).
export default defineEventHandler(async (event): Promise<AuthorizationPermissionsDto> => {
  const { user } = await requireAuth(event)
  const stored = await useAuthUserStore().findById(user.id as number)
  const role = stored ? await resolveAuthorizationRole(event, stored) : null
  const permissions = await getAuthUserPermissions(event, (stored ?? { id: user.id }) as { id: number })
  return {
    role: role ? { name: role.name, label: role.label } : null,
    permissions: permissions ?? ['*'],
  }
})
