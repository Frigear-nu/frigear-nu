import type { AuthorizationPermissionMatrixDto } from '../../../../types'

// `GET /api/admin/authorization/permissions`: every registered permission against every role.
export default defineEventHandler(async (event): Promise<AuthorizationPermissionMatrixDto> => {
  const table = await requireAuthorizationRolesStaff(event)
  return toAuthorizationPermissionMatrixDto(table)
})
