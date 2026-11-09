import { db, schema } from '@nuxthub/db'
import { count } from 'drizzle-orm'
import type { AuthorizationRoleSummaryDto } from '../../../../types'

// `GET /api/admin/authorization/roles`: every role, most senior first, with how many users have it.
export default defineEventHandler(async (event): Promise<AuthorizationRoleSummaryDto[]> => {
  const table = await requireRolesStaff(event)
  const counts = await authorizationRoleUserCounts()
  return table.roles.map((role, rank) => toAuthorizationRoleSummaryDto(table, role, rank, counts.get(role.name) ?? 0))
})

async function authorizationRoleUserCounts(): Promise<Map<string, number>> {
  const users = schema.users as typeof schema.users & { role: typeof schema.users.name }
  const rows = await db.select({ role: users.role, total: count() }).from(users).groupBy(users.role)
  return new Map(rows.map(row => [row.role, row.total]))
}
