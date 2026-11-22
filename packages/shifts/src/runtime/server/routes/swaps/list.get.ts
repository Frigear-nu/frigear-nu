import { shiftsAccess } from '../../../access'
import type { ShiftSwapDto } from '../../../../types'

// The swap marketplace: the open swaps I could take (published, not started, not mine, on shifts I am eligible for and
// not on already), each with my own live offer (`myOffer`). The owners show by name only.
export default defineEventHandler(async (event): Promise<ShiftSwapDto[]> => {
  const principal = await authorize(event, shiftsAccess.permissions.read)
  return shiftsAvailableSwaps(event, Number(principal.user.id))
})
