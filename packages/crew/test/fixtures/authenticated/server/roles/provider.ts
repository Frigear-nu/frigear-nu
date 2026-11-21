import { db } from '@nuxthub/db'
import type { AuthRoleProvider } from '@frigear-nu/auth/utils'

// Test-only role provider (no `@frigear-nu/authorization`): the role follows the email domain, so the same rule
// applies to cookie sessions and API tokens alike.
//   @staff.test  -> `admin` (what operations, teams, forms and crew grant to admin, `crew:pii` and `crew:invite` included)
//   @coord.test  -> `coordinator` (crew:manage, crew:pii and crew:invite, as the module's `grantTo`)
//   @mgr.test    -> `crewmanager` (crew:manage only: no crew:pii)
//   @bar.test    -> `supervisor` (inherits `member`)
//   @crew.test   -> `crew`
//   @member.test -> `member`
//   @wild.test   -> `wild` (crew:* only, which never covers crew:pii)
const ROLES: Record<string, string[]> = {
  '@staff.test': ['admin'],
  '@coord.test': ['coordinator'],
  '@mgr.test': ['crewmanager'],
  '@bar.test': ['supervisor'],
  '@crew.test': ['crew'],
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
