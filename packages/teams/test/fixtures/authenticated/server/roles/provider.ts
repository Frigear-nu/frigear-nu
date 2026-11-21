import { db } from '@nuxthub/db'
import type { AuthRoleProvider } from '@frigear-nu/auth/utils'

// Test-only role provider (no `@frigear-nu/authorization`): the role follows the email domain, so the same rule
// applies to cookie sessions and API tokens alike.
//   @staff.test  -> `coordinator` (teams:manage and teams:pii, granted by the module's `grantTo`)
//   @bar.test    -> `barmanager` (inherits `member`)
//   @member.test -> `member`
//   @wild.test   -> `wild` (teams:* only, which never covers teams:pii)
const ROLES: Record<string, string[]> = {
  '@staff.test': ['coordinator'],
  '@bar.test': ['barmanager'],
  '@member.test': ['member'],
  '@wild.test': ['wild'],
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
