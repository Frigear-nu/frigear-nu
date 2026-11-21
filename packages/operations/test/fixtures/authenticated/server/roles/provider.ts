import { db } from '@nuxthub/db'
import type { AuthRoleProvider } from '@frigear-nu/auth/utils'

// Test-only role provider (no `@frigear-nu/authorization`): the role follows the email domain, so the same rule
// applies to cookie sessions and API tokens alike.
//   @staff.test -> `coordinator` (operations:manage, granted by the module's `grantTo`)
//   @wild.test  -> `wild` (operations:* only)
//   @ops.test   -> `opsmanager` (operations:manage, but not maps:manage)
const provider: AuthRoleProvider = {
  getAssignedRoles: async (_event, userId) => {
    const actor = await db.query.users.findFirst({ where: (t, { eq }) => eq(t.id, Number(userId)) })
    if (actor?.email.endsWith('@staff.test')) return ['coordinator']
    if (actor?.email.endsWith('@wild.test')) return ['wild']
    if (actor?.email.endsWith('@ops.test')) return ['opsmanager']
    return []
  },
  setRoles: async () => {},
}

export default provider
