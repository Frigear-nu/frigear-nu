import type { AuthorizationUserRolesDto } from '../../utils/api'
import UserRolesSlideover from './UserRolesSlideover.vue'
import { useOverlay } from '#imports'

/**
 * What staff can do with a user's roles: `edit(user, roles)` opens the role form and resolves with the saved roles, or
 * `false` when cancelled. The server checks `roles:assign` and that the caller holds every permission of each role.
 */
export function useUserRoleActions() {
  const overlay = useOverlay()

  async function edit(user: { id: number, name: string }, roles: AuthorizationUserRolesDto): Promise<AuthorizationUserRolesDto | false> {
    const saved = await overlay.create(UserRolesSlideover, { destroyOnClose: true }).open({ user, roles }).result
    return saved || false
  }

  return { edit }
}
