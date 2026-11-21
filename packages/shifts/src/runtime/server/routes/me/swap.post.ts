import { created, idParams, notFound } from '@frigear-nu/module-kit/server'
import { shiftsAccess } from '../../../access'
import type { ShiftSwapDto } from '../../../../types'

// Opens a swap of one of my shifts (assigned, in a published schedule, not started; 409 `not_swappable` otherwise):
// `{ kind?: 'trade' | 'release', wantedAssignmentId? }`. The schedule must allow the kind (409 `handover_not_allowed`);
// a trade may aim at one assignment of somebody else. Opening it again answers the live swap.
export default defineEventHandler(async (event): Promise<ShiftSwapDto> => {
  const principal = await authorize(event, shiftsAccess.permissions.swap)
  const { assignmentId } = await getValidatedRouterParams(event, idParams('assignmentId').parse)
  const input = await readValidatedBody(event, shiftsOpenSwapInput.parse)
  const entry = await getShiftAssignmentEntryOr404(assignmentId)
  if (entry.assignment.userId !== Number(principal.user.id)) throw notFound('Assignment not found.')
  await authorize(event, shiftsAccess.permissions.swap, { userId: entry.assignment.userId })
  return created(event, await shiftsOpenSwap(event, entry, input))
})
