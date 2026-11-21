import { crewAccess } from '../../../access'
import type { MyCrewDto } from '../../../../types'

// My crew status in every operation I applied to or work at (any status). Only my own rows: the caller is the user.
export default defineEventHandler(async (event): Promise<MyCrewDto[]> => {
  const principal = await authorize(event, crewAccess.permissions.read)
  return crewMyEntries(event, Number(principal.user.id))
})
