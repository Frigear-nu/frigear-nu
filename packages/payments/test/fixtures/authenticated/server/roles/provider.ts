import { db } from '@nuxthub/db'
import type { AuthRoleProvider } from '@frigear-nu/auth/utils'

// Test-only role provider (no `@frigear-nu/authorization`): only staff@example.com is staff (role `staff`), whatever
// the credential, so the same rule applies to cookie sessions and API tokens.
const provider: AuthRoleProvider = {
  getAssignedRoles: async (_event, userId) => {
    const actor = await db.query.users.findFirst({ where: (t, { eq }) => eq(t.id, Number(userId)) })
    return actor?.email === 'staff@example.com' ? ['staff'] : []
  },
  setRoles: async () => {},
}

export default provider
