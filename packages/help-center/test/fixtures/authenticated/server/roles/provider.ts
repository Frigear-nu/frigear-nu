import { db } from '@nuxthub/db'
import type { AuthRoleProvider } from '@frigear-nu/auth/utils'

// Test-only role provider (no `@frigear-nu/authorization`): the role follows the email domain, so the same rule
// applies to cookie sessions and API tokens alike.
//   @staff.test -> `coordinator` (help-center:manage, :send and :pii, granted by the module's `grantTo`)
//   @wild.test  -> `wild` (help-center:* only: not :pii)
//   @bar.test   -> `barmanager` (no staff permission: only what a `globalRoles` visibility lets through)
const provider: AuthRoleProvider = {
  getAssignedRoles: async (_event, userId) => {
    const actor = await db.query.users.findFirst({ where: (t, { eq }) => eq(t.id, Number(userId)) })
    if (actor?.email.endsWith('@staff.test')) return ['coordinator']
    if (actor?.email.endsWith('@wild.test')) return ['wild']
    if (actor?.email.endsWith('@bar.test')) return ['barmanager']
    return []
  },
  setRoles: async () => {},
}

export default provider
