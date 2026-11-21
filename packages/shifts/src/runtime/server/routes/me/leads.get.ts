import { shiftsAccess } from '../../../access'
import type { ShiftsLedTeamDto } from '../../../../types'

// The teams of operations I lead (BA and up on a bar team): where my lead page and the scanner apply.
export default defineEventHandler(async (event): Promise<ShiftsLedTeamDto[]> => {
  const principal = await authorize(event, shiftsAccess.permissions.read)
  return shiftsLedTeams(event, Number(principal.user.id))
})
