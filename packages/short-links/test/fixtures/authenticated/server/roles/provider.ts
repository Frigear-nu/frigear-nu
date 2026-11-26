import { db } from '@nuxthub/db'
import type { AuthRoleProvider } from '@frigear-nu/auth/utils'

// Test-only role provider (no `@frigear-nu/authorization`): the role follows the email domain, so the same rule
// applies to cookie sessions and API tokens alike.
//   @staff.test -> `marketing` (short-links:manage, granted by name in `nuxt.config.ts`)
const provider: AuthRoleProvider = {
  getAssignedRoles: async (_event, userId) => {
    const actor = await db.query.users.findFirst({ where: (t, { eq }) => eq(t.id, Number(userId)) })
    return actor?.email.endsWith('@staff.test') ? ['marketing'] : []
  },
  setRoles: async () => {},
}

export default provider
