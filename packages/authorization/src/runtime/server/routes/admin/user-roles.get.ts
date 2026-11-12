import { intIdParams, notFound } from '@frigear-nu/module-kit/server'
import type { AuthorizationUserRolesDto } from '../../../../types'
import { assignableRoles } from '../../../utils/assignment'

// `GET /api/admin/authorization/users/:id/roles`: a user's stored roles, effective roles and permissions. For staff
// holding `roles:read` or `roles:assign`; `assignable` lists what the caller may assign (empty without `roles:assign`).
export default defineEventHandler(async (event): Promise<AuthorizationUserRolesDto> => {
  const canAssign = await allows(event, 'roles:assign')
  const principal = await authorize(event, canAssign ? 'roles:assign' : 'roles:read')
  const { id } = await getValidatedRouterParams(event, intIdParams().parse)
  const target = await loadAuthUser(id)
  if (!target) throw notFound('User not found.')
  const { table, registry } = useAuthorizationAccessTables()
  const assignable = canAssign ? assignableRoles(table, registry, await getUserGrants(event, principal.user)) : []
  return toAuthorizationUserRolesDto(event, target, assignable)
})
