import { db, schema } from '@nuxthub/db'
import { inArray } from 'drizzle-orm'
import { chunkGrantParams, defineGrantKind } from '@frigear-nu/auth/grants'
import { table as authRoleTable } from '#auth/roles'
import { roleGrantSchema, rolesGranting } from '../../utils/grants'

/** The most users the `role` kind checks when it lists members. */
export const AUTHORIZATION_ROLE_GRANT_MEMBER_LIMIT = 1000

// The `role` grant kind (grant lists of `@frigear-nu/auth`): callers holding a global role (auth's effective roles,
// inheritance included).
//
// `members` reads the roles assigned in `authorization_user_roles`, including roles that inherit the wanted one, and
// keeps the users whose effective roles still hold it. A role only given through `defaultRoles`, an `auto` role or the
// `authorization:roles` hook is never stored, so its holders are not listed.
export default defineGrantKind('role', {
  schema: roleGrantSchema,
  async matches({ event, user, grant }) {
    if (!user) return false
    return (await getEffectiveRoles(event, user as Parameters<typeof getEffectiveRoles>[1])).includes(grant.role)
  },
  async members({ event, grants }) {
    const roles = schema.authorizationUserRoles
    const wanted = [...new Set(grants.map(grant => grant.role))]
    const candidates = new Set<number>()
    for (const chunk of chunkGrantParams(rolesGranting(authRoleTable.roles, wanted))) {
      const rows = await db.selectDistinct({ userId: roles.userId }).from(roles).where(inArray(roles.role, chunk))
        .limit(AUTHORIZATION_ROLE_GRANT_MEMBER_LIMIT)
      for (const row of rows) candidates.add(Number(row.userId))
    }
    const members: number[] = []
    for (const id of [...candidates].slice(0, AUTHORIZATION_ROLE_GRANT_MEMBER_LIMIT)) {
      const user = await loadAuthUser(id)
      if (!user) continue
      const held = await getEffectiveRoles(event, user)
      if (wanted.some(role => held.includes(role))) members.push(id)
    }
    return members
  },
})
