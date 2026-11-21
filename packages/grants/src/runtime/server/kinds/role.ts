import { db, schema } from '@nuxthub/db'
import { inArray } from 'drizzle-orm'
import type { Column } from 'drizzle-orm'
import { table as authRoleTable } from '#auth/roles'
import { chunkGrantParams, defineGrantKind, roleGrantSchema } from '../../utils/core'

/** The most users the `role` kind checks when it lists members. */
export const GRANTS_ROLE_MEMBER_LIMIT = 1000

type RoleRows = { userId: Column, role: Column }

/** The roles that grant any of `wanted`: the roles themselves and every role inheriting one, directly or not. */
export function grantsRolesGranting(roles: Readonly<Record<string, { inherit?: readonly string[] }>>, wanted: readonly string[]): string[] {
  const result = new Set(wanted)
  let grew = true
  while (grew) {
    grew = false
    for (const [name, role] of Object.entries(roles)) {
      if (!result.has(name) && (role.inherit ?? []).some(parent => result.has(parent))) {
        result.add(name)
        grew = true
      }
    }
  }
  return [...result].sort()
}

// The built-in `role` kind: callers holding a global role (auth's effective roles, inheritance included).
//
// `members` reads the roles assigned in `@frigear-nu/authorization` (when it is installed), including roles that
// inherit the wanted one, and keeps the users whose effective roles still hold it. A role only given through
// `defaultRoles`, an `auto` role or the `authorization:roles` hook cannot be enumerated, so its holders are not listed.
export default defineGrantKind('role', {
  schema: roleGrantSchema,
  async matches({ event, user, grant }) {
    if (!user) return false
    return (await getEffectiveRoles(event, user as Parameters<typeof getEffectiveRoles>[1])).includes(grant.role)
  },
  async members({ event, grants }) {
    const table = (schema as unknown as { authorizationUserRoles?: RoleRows }).authorizationUserRoles
    if (!table) return []
    const wanted = [...new Set(grants.map(grant => grant.role))]
    const granting = grantsRolesGranting(authRoleTable.roles, wanted)
    const candidates = new Set<number>()
    for (const chunk of chunkGrantParams(granting)) {
      const rows = await db.selectDistinct({ userId: table.userId }).from(table as never).where(inArray(table.role, chunk))
        .limit(GRANTS_ROLE_MEMBER_LIMIT) as Array<{ userId: unknown }>
      for (const row of rows) candidates.add(Number(row.userId))
    }
    const members: number[] = []
    for (const id of [...candidates].slice(0, GRANTS_ROLE_MEMBER_LIMIT)) {
      const user = await loadAuthUser(id)
      if (!user) continue
      const roles = await getEffectiveRoles(event, user)
      if (wanted.some(role => roles.includes(role))) members.push(id)
    }
    return members
  },
})
