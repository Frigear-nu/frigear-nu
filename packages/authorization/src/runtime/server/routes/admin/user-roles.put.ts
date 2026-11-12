import { z } from 'zod'
import { apiError, forbidden, intIdParams, notFound } from '@frigear-nu/module-kit/server'
import type { AuthorizationUserRolesDto } from '../../../../types'
import { assignableRoles, planRoleAssignment } from '../../../utils/assignment'

const bodySchema = z.object({
  roles: z.array(z.string().trim().min(1).max(100)).max(100),
})

// `PUT /api/admin/authorization/users/:id/roles`: replaces the roles assigned by staff (`manual` and `migrated` rows;
// single sign-on rows stay). `roles:assign` (session only); each role added or removed must be strictly below the caller:
// they hold all of its permissions (403 `forbidden`) and at least one more, or every registered permission (403
// `role_not_below`). Default, `auto` and non-assignable roles are 409 `role_not_assignable`. The caller's roles are
// resolved strictly: when they cannot be, nothing changes (403 `forbidden`).
export default defineEventHandler(async (event): Promise<AuthorizationUserRolesDto> => {
  const principal = await authorize(event, 'roles:assign')
  const { id } = await getValidatedRouterParams(event, intIdParams().parse)
  const body = await readValidatedBody(event, bodySchema.parse)
  const target = await loadAuthUser(id)
  if (!target) throw notFound('User not found.')

  const { table, registry } = useAuthorizationAccessTables()
  // Fail closed: an actor whose roles cannot be resolved would be compared with fewer permissions than they hold.
  try {
    await getEffectiveRoles(event, principal.user, { strict: true })
  }
  catch {
    throw forbidden('Your roles could not be checked right now.')
  }
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
