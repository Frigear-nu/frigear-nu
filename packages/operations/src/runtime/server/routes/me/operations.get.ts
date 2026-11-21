import { operationsAccess } from '../../../access'
import type { OperationDto } from '../../../../types'

// The operations the caller takes part in (`takesPart` of `@frigear-nu/audience`), filled by the modules that
// know participation (crew). Empty while no such module is installed.
export default defineEventHandler(async (event): Promise<OperationDto[]> => {
  const principal = await authorize(event, operationsAccess.permissions.read)
  const viewer = await resolveOperationsViewer(event, principal.user)
  return (await listParticipatingOperations(viewer)).map(toOperationDto)
})
