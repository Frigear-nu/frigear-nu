import { db } from '@nuxthub/db'
import type { AuthRoleProvider } from '@frigear-nu/auth/utils'

// Test-only role provider (no `@frigear-nu/authorization`): the role follows the email domain, so the same rule
// applies to cookie sessions and API tokens alike.
//   @admin.test   -> `admin` (everything campaigns grants to admin, `campaigns:pii` included)
//   @manager.test -> `manager` (`campaigns:manage` only)
//   @wild.test    -> `wild` (`campaigns:*`, which never covers `campaigns:pii`)
//   @sender.test  -> `sender` (`campaigns:manage` and `campaigns:send`, not `campaigns:send-important`)
const ROLES: Record<string, string[]> = {
  '@admin.test': ['admin'],
  '@manager.test': ['manager'],
  '@wild.test': ['wild'],
  '@sender.test': ['sender'],
}

const provider: AuthRoleProvider = {
  getAssignedRoles: async (_event, userId) => {
    const actor = await db.query.users.findFirst({ where: (t, { eq }) => eq(t.id, Number(userId)) })
    const domain = Object.keys(ROLES).find(suffix => actor?.email.endsWith(suffix))
    return domain ? ROLES[domain]! : []
  },
  setRoles: async () => {},
}

export default provider
