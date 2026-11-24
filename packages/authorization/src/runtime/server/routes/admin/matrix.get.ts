import type { AuthorizationRoleMatrixDto } from '../../../../types'
import { authorizationAccess } from '../../../access'
import { toRoleMatrix } from '../../../utils/roles-view'

// `GET /api/admin/authorization/matrix`: every role against every registered permission, with why each role holds each.
export default defineEventHandler(async (event): Promise<AuthorizationRoleMatrixDto> => {
  await authorize(event, authorizationAccess.permissions['roles:read'])
  const { table, registry } = useAuthorizationAccessTables()
  return toRoleMatrix(table, registry, await countAuthorizationRoleUsers())
})
