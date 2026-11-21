import { db } from '@nuxthub/db'
import type { AuthRoleProvider } from '@frigear-nu/auth/utils'

// Test-only role provider (no `@frigear-nu/authorization`): the role follows the email domain, so the same rule
// applies to cookie sessions and API tokens alike.
//   @staff.test    -> `coordinator` (maps:manage, granted by the module's `grantTo`)
//   @firstaid.test -> `firstaid` (first-aid:manage: the first aid kind's `editPermission`)
//   @shifts.test   -> `shiftreader` (test-shifts:read: the on-duty provider layer's permission)
//   @vip.test      -> `vip` (a global role a visibility can name)
const ROLES: Record<string, string> = {
  'staff.test': 'coordinator',
  'firstaid.test': 'firstaid',
  'shifts.test': 'shiftreader',
  'vip.test': 'vip',
}

const provider: AuthRoleProvider = {
  getAssignedRoles: async (_event, userId) => {
    const actor = await db.query.users.findFirst({ where: (t, { eq }) => eq(t.id, Number(userId)) })
    const role = actor ? ROLES[actor.email.split('@')[1] ?? ''] : undefined
    return role ? [role] : []
  },
  setRoles: async () => {},
}

export default provider
