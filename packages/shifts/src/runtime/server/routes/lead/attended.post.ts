import { idParams } from '@frigear-nu/module-kit/server'
import { shiftsAccess } from '../../../access'
import type { ShiftAssigneeDto } from '../../../../types'

// Marks an assignment attended (a lead of the shift's team, or staff), without a scan. Fires `shifts:attendance:marked`.
export default defineEventHandler(async (event): Promise<ShiftAssigneeDto> => {
  const principal = await authorize(event, shiftsAccess.permissions.lead)
  const { assignmentId } = await getValidatedRouterParams(event, idParams('assignmentId').parse)
  const entry = await getShiftAssignmentEntryOr404(assignmentId)
  await authorize(event, shiftsAccess.permissions.lead, { teamId: entry.shift.teamId })
  const row = await shiftsMarkAttendance(event, entry, 'attended', Number(principal.user.id))
  const [dto] = await shiftsAssigneeDtos([row], await allows(event, shiftsAccess.permissions.pii))
  return dto!
})
