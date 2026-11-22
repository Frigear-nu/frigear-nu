import { db } from '@nuxthub/db'
import type { AuthRoleProvider } from '@frigear-nu/auth/utils'

// Test-only role provider (no `@frigear-nu/authorization`): the role follows the email domain, so the same rule
// applies to cookie sessions and API tokens alike.
//   @staff.test  -> `coordinator` (teams:manage and teams:pii, granted by name in `nuxt.config.ts`)
//   @bar.test    -> `supervisor` (inherits `member`)
//   @member.test -> `member`
//   @wild.test   -> `wild` (teams:* only, which never covers teams:pii)
const ROLES: Record<string, string[]> = {
  '@staff.test': ['coordinator'],
  '@bar.test': ['supervisor'],
  '@member.test': ['member'],
  '@wild.test': ['wild'],
}

const rolesOfEmail = (email: string | undefined): string[] => {
  const domain = Object.keys(ROLES).find(suffix => email?.endsWith(suffix))
  return domain ? ROLES[domain]! : []
}

const provider: AuthRoleProvider = {
  getAssignedRoles: async (_event, userId) => {
    const actor = await db.query.users.findFirst({ where: (t, { eq }) => eq(t.id, Number(userId)) })
    return rolesOfEmail(actor?.email)
  },
  // Many users at once (auth's `primeAssignedRoles`), as `@frigear-nu/authorization` does: one statement.
  assignedRolesOf: async (userIds) => {
    const users = await db.query.users.findMany({ columns: { id: true, email: true }, where: (t, { inArray }) => inArray(t.id, userIds) })
    return new Map(users.map(user => [user.id, rolesOfEmail(user.email)]))
  },
  setRoles: async () => {},
  // Who has one of `roles` (auth's `listRoleHolders`, which teams reads its role candidates from).
  holders: async (roles, { limit }) => {
    const users = await db.query.users.findMany({ columns: { id: true, email: true } })
    return users.filter(user => Object.entries(ROLES).some(([suffix, held]) => user.email.endsWith(suffix) && held.some(role => roles.includes(role))))
      .map(user => user.id).slice(0, limit)
  },
}

export default provider
