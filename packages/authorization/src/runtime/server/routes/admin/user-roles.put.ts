import { z } from 'zod'
import { apiError, intIdParams, notFound } from '@frigear-nu/module-kit/server'
import type { AuthorizationUserRolesDto } from '../../../../types'
import { assignableRoles, planRoleAssignment } from '../../../utils/assignment'

const bodySchema = z.object({
  roles: z.array(z.string().trim().min(1).max(100)).max(100),
})

// `PUT /api/admin/authorization/users/:id/roles`: replaces the roles assigned by staff (`manual` and `migrated` rows;
// single sign-on rows stay). `roles:assign` (session only), and the caller must hold every permission of each role
// they add or remove (403); default, `auto` and non-assignable roles are 409 `role_not_assignable`.
export default defineEventHandler(async (event): Promise<AuthorizationUserRolesDto> => {
  const principal = await authorize(event, 'roles:assign')
  const { id } = await getValidatedRouterParams(event, intIdParams().parse)
  const body = await readValidatedBody(event, bodySchema.parse)
  const target = await loadAuthUser(id)
  if (!target) throw notFound('User not found.')

  const { table, registry } = useAuthorizationAccessTables()
  const actorHeld = await getUserGrants(event, principal.user)
  const plan = planRoleAssignment({
    table,
    registry,
    current: await listAuthorizationUserRoles(id),
    requested: body.roles,
    actorHeld,
  })
  if (!plan.ok) {
    throw apiError(plan.status, plan.code, plan.message, { role: plan.role, ...('missing' in plan ? { missing: plan.missing } : {}) })
  }
  await applyAuthorizationRoleAssignment(id, plan, Number(principal.user.id))
  // No `event`: the roles cached earlier in this request (the caller may be the target) are stale now.
  const assignable = assignableRoles(table, registry, await getUserGrants(undefined, principal.user))
  return toAuthorizationUserRolesDto(undefined, target, assignable)
})
