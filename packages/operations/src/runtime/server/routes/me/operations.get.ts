import { operationsAccess } from '../../../access'
import type { OperationDto } from '../../../../types'

// The operations the caller takes part in (`operations:participation:resolve`), answered by the modules that know
// participation (crew). Empty while no such module is installed.
export default defineEventHandler(async (event): Promise<OperationDto[]> => {
  const principal = await authorize(event, operationsAccess.permissions.read)
  return (await listParticipatingOperations(event, principal.user.id)).map(toOperationDto)
})
