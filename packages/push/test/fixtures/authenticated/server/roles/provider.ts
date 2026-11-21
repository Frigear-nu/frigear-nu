import { db } from '@nuxthub/db'
import type { AuthRoleProvider } from '@frigear-nu/auth/utils'

// Test-only role provider (no `@frigear-nu/authorization`): only staff@example.com is staff (role `staff`), and
// reader@example.com only reads users (role `reader`), whatever the credential, so the same rule applies to cookie
// sessions and API tokens.
const provider: AuthRoleProvider = {
  getAssignedRoles: async (_event, userId) => {
    const actor = await db.query.users.findFirst({ where: (t, { eq }) => eq(t.id, Number(userId)) })
    if (actor?.email === 'staff@example.com') return ['staff']
    return actor?.email === 'reader@example.com' ? ['reader'] : []
  },
  setRoles: async () => {},
}

export default provider
