import { idParams } from '@frigear-nu/module-kit/server'
import { crewAccess } from '../../../access'
import type { CrewMemberDto } from '../../../../types'

// Approves several people of one operation at once (`{ ids }`, at most 200). People who cannot be approved (unknown ids,
// people of another operation, or a status that cannot become approved) come back in `skipped`; those approved already
// are skipped too.
export default defineEventHandler(async (event): Promise<{ approved: CrewMemberDto[], skipped: string[] }> => {
  const principal = await authorize(event, crewAccess.permissions.manage)
  const { operationId } = await getValidatedRouterParams(event, idParams('operationId').parse)
  const { ids } = await readValidatedBody(event, crewBulkApproveInput.parse)
  const operation = await getOperationOr404(operationId)
  await authorize(event, crewAccess.permissions.manage, operation)
  const result = await crewApproveMany(event, operation.id, ids, Number(principal.user.id))
  const pii = await allows(event, crewAccess.permissions.pii)
  return { approved: await Promise.all(result.approved.map(entry => crewMemberDtoOf(entry, operation, pii))), skipped: result.skipped }
})
