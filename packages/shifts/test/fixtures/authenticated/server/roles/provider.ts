import { db } from '@nuxthub/db'
import type { AuthRoleProvider } from '@frigear-nu/auth/utils'

// Test-only role provider (no `@frigear-nu/authorization`): the role follows the email domain, so the same rule
// applies to cookie sessions and API tokens alike.
//   @staff.test  -> `admin` (shifts:manage, shifts:pii, and what operations, teams and crew grant to admin)
//   @coord.test  -> `coordinator` (the staff permissions it names in `nuxt.config.ts`)
//   @mgr.test    -> `shiftmanager` (shifts:manage only: no shifts:pii)
//   @bar.test    -> `supervisor` (a mapping rule makes them a lead on a team without a membership row)
//   @wild.test   -> `wild` (shifts:* only, which never covers shifts:pii)
const ROLES: Record<string, string[]> = {
  '@staff.test': ['admin'],
  '@coord.test': ['coordinator'],
  '@mgr.test': ['shiftmanager'],
  '@bar.test': ['supervisor'],
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
