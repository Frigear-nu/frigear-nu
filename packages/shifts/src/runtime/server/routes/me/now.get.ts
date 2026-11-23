import { shiftsAccess } from '../../../access'
import type { ShiftsMyNowDto } from '../../../../types'

// My teams that are on shift now, per operation I work at, with who is on and the leads among them (names only). The
// dashboard item "My team on shift now" reads it; `GET /api/shifts/operations/:id/now` is the same view of a whole
// operation. People who take part in the operation and staff may read that view, so a team of an operation I may not read
// is left out.
export default defineEventHandler(async (event): Promise<ShiftsMyNowDto> => {
  const principal = await authorize(event, shiftsAccess.permissions.read)
  return shiftsMyNow(event, Number(principal.user.id))
})
