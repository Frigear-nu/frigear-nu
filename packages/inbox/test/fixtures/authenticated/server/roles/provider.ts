import { db } from '@nuxthub/db'
import type { AuthRoleProvider } from '@frigear-nu/auth/utils'

// Test-only role provider (no `@frigear-nu/authorization`): the role follows the email domain, so the same rule
// applies to cookie sessions and API tokens alike.
//   @admin.test -> `admin` (inherits coordinator and crew; everything the inbox grants to admin)
//   @coord.test -> `coordinator` (inherits crew; inbox:assign and inbox:hide)
//   @crew.test  -> `crew`
//   @wild.test  -> `wild` (inbox:*, which never covers inbox:pii or inbox-audit:pii)
const ROLES: Record<string, string[]> = {
  '@admin.test': ['admin'],
  '@coord.test': ['coordinator'],
  '@crew.test': ['crew'],
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
