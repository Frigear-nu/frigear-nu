import { db, schema } from '@nuxthub/db'
import { count, eq } from 'drizzle-orm'
import { idParams } from '@frigear-nu/module-kit/server'
import type { AuthorizationRoleDto } from '../../../../types'

// `GET /api/admin/authorization/roles/:name`: one role with every registered permission and why it holds it.
export default defineEventHandler(async (event): Promise<AuthorizationRoleDto> => {
  await requireAuthorizationRolesStaff(event)
  const { name } = await getValidatedRouterParams(event, idParams('name').parse)
  const { table, role, rank } = requireAuthorizationRole(name)
  const users = schema.users as typeof schema.users & { role: typeof schema.users.name }
  const [totals] = await db.select({ total: count() }).from(users).where(eq(users.role, role.name))
  return toAuthorizationRoleDto(table, role, rank, totals?.total ?? 0)
})
