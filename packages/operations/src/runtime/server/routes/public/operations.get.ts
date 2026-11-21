import { operationsAccess } from '../../../access'
import type { OperationDto } from '../../../../types'

// The public operations, plus the ones the signed-in caller takes part in. Archived ones only with `?status=archived`.
// Anonymous visitors, and tokens without `operations:read`, see the public ones only.
export default defineEventHandler(async (event): Promise<OperationDto[]> => {
  const query = await getValidatedQuery(event, operationListQuery.parse)
  const principal = await allows(event, operationsAccess.permissions.read) ? await getAuth(event) : null
  const viewer = await resolveOperationsViewer(event, principal?.user ?? null)
  const rows = await listReadableOperations({ viewer, canManage: false, status: query.status })
  return rows.map(toOperationDto)
})
