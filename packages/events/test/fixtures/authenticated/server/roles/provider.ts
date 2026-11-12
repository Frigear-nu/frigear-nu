import { db } from '@nuxthub/db'
import type { AuthRoleProvider } from '@frigear-nu/auth/utils'

// Test-only role provider (no `@frigear-nu/authorization`): the role follows the email domain, so the same rule
// applies to cookie sessions and API tokens alike.
//   @staff.test  -> `eventmanager` (events:manage + events:pii)
//   @wild.test   -> `wild` (events:* only: the wildcard does not cover the sensitive events:pii)
//   @scoped.test -> `eventmanager`, limited to `scoped-*` events by the policy in `server/policies.ts`
const provider: AuthRoleProvider = {
  getAssignedRoles: async (_event, userId) => {
    const actor = await db.query.users.findFirst({ where: (t, { eq }) => eq(t.id, Number(userId)) })
    if (actor?.email.endsWith('@staff.test') || actor?.email.endsWith('@scoped.test')) return ['eventmanager']
    if (actor?.email.endsWith('@wild.test')) return ['wild']
    return []
  },
  setRoles: async () => {},
}

export default provider
