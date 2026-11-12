import { db } from '@nuxthub/db'
import type { AuthRoleProvider } from '@frigear-nu/auth/utils'

// Test-only role provider (no `@frigear-nu/authorization`): the role follows the email domain, so the same rule
// applies to cookie sessions and API tokens alike.
//   @staff.test  -> `formsmanager` (forms:manage + forms:pii + forms:credentials)
//   @wild.test   -> `wild` (forms:* only: the wildcard does not cover the sensitive forms:pii)
const provider: AuthRoleProvider = {
  getAssignedRoles: async (_event, userId) => {
    const actor = await db.query.users.findFirst({ where: (t, { eq }) => eq(t.id, Number(userId)) })
    if (actor?.email.endsWith('@staff.test')) return ['formsmanager']
    if (actor?.email.endsWith('@wild.test')) return ['wild']
    return []
  },
  setRoles: async () => {},
}

export default provider
