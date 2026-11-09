import type { H3Event } from 'h3'
import { rbac } from '#authorization/rbac'
import type { AuthorizationRoleContext } from '../../../types'
import { canAssignRole, roleOf } from '../../utils/rbac'
import type { RbacRole, RbacTable } from '../../utils/rbac'

type RoleUser = AuthorizationRoleContext['user']

/** The compiled role → permission table, or `null` when `rbac` is off. */
export function useAuthorizationRoles(): RbacTable | null {
  return rbac
}

/**
 * The role `user` acts as (`rbac` on): their stored `role`, as changed by `authorization:role` listeners, or the
 * default role when it is unknown. `null` with `rbac` off.
 */
export async function resolveAuthorizationRole(event: H3Event, user: RoleUser): Promise<RbacRole | null> {
  if (!rbac) return null
  const ctx: AuthorizationRoleContext = { event, user, role: user.role }
  await useNitroApp().hooks.callHook('authorization:role', ctx)
  return roleOf(rbac, ctx.role)
}

/** Whether `actor` may give someone `role` or change a user who has it: roles below their own; admins manage admins. */
export function canAssignAuthorizationRole(actor: string | null | undefined, role: string | null | undefined): boolean {
  return !!rbac && canAssignRole(rbac, actor, role)
}
