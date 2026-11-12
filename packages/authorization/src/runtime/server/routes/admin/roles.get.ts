import type { AuthorizationRoleSummaryDto } from '../../../../types'
import { sortedRoles, toRoleSummary } from '../../../utils/roles-view'

// `GET /api/admin/authorization/roles`: every configured role, with how many users have it assigned.
export default defineEventHandler(async (event): Promise<AuthorizationRoleSummaryDto[]> => {
  await authorize(event, 'roles:read')
  const { table, registry } = useAuthorizationAccessTables()
  const counts = await countAuthorizationRoleUsers()
  return sortedRoles(table).map(role => toRoleSummary(role, counts.get(role.name) ?? 0, table, registry))
})
