import type { AuthRoleProvider } from '@frigear-nu/auth/utils'
import { getTestUser } from '../utils/test-users'

// The fixture's role provider: a stored `role` other than `user` is the user's one assigned role.
const provider: AuthRoleProvider = {
  getAssignedRoles: async (_event, userId) => {
    const role = getTestUser(String(userId))?.role
    return role && role !== 'user' ? [role] : []
  },
  setRoles: async () => {},
}

export default provider
