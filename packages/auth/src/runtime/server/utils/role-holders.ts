import type { H3Event } from 'h3'
import { hasProvider, provider, table } from '#auth/roles'
import { collectRoleHolders } from '../../utils/permissions'
import { getEffectiveRoles, primeAssignedRoles } from './access'
import type { AuthUser } from '../../types'
import { loadAuthUsers } from './user-store'

export interface ListRoleHoldersOptions {
  /** At most this many users (default and maximum `ROLE_HOLDER_LIMIT`, 1000). */
  limit?: number
}

/**
 * The ids of the users holding at least one of `roles`, inheritance included (a role inheriting a wanted one counts),
 * at most `limit` of them. The role provider (`setRoleProvider`, `@frigear-nu/authorization`) lists the users with a
 * stored role through its optional `holders`; each one is then checked against their effective roles, so a requirement
 * that fails or an `authorization:roles` listener that removes the role leaves them out.
 *
 * Fail closed: without a provider, with one that has no `holders`, or when it throws, nobody is listed. Roles that are
 * never stored (`defaultRoles`, `auto` roles, roles added by the `authorization:roles` hook) cannot be enumerated, so
 * their holders are only listed when they also hold a stored role granting them.
 */
export async function listRoleHolders(event: H3Event | undefined, roles: readonly string[], options: ListRoleHoldersOptions = {}): Promise<number[]> {
  const holders = hasProvider ? provider.holders?.bind(provider) : undefined
  // The candidates and their stored roles are loaded once, in bulk, before each one is checked: no read per person.
  let users = new Map<number, AuthUser>()
  try {
    return await collectRoleHolders({
      roles,
      table: table.roles,
      limit: options.limit,
      holders,
      prime: async (userIds) => {
        [users] = await Promise.all([loadAuthUsers(userIds), primeAssignedRoles(event, userIds)])
      },
      holds: async (userId) => {
        const user = users.get(userId)
        if (!user) return false
        const held = await getEffectiveRoles(event, user)
        return roles.some(role => held.includes(role))
      },
    })
  }
  catch (error) {
    console.error('[auth] the role holders could not be listed; nobody is listed', error)
    return []
  }
}
