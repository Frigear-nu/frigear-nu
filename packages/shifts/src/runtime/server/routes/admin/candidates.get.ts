import { idParams } from '@frigear-nu/module-kit/server'
import { shiftsAccess } from '../../../access'
import type { ShiftCandidateDto } from '../../../../types'

// The people of a shift's team staff could assign (`?q` matches the name, and the email with `shifts:pii`), with whether
// they are eligible and the guards they would break.
export default defineEventHandler(async (event): Promise<ShiftCandidateDto[]> => {
  await authorize(event, shiftsAccess.permissions.manage)
  const { shiftId } = await getValidatedRouterParams(event, idParams('shiftId').parse)
  const { q, shiftRoleId } = await getValidatedQuery(event, shiftsCandidatesQuery.parse)
  const entry = await getShiftEntryOr404(shiftId)
  await authorize(event, shiftsAccess.permissions.manage, { operationId: entry.schedule.operationId })
  return shiftsCandidates(event, entry, q, await allows(event, shiftsAccess.permissions.pii), shiftRoleId)
})
