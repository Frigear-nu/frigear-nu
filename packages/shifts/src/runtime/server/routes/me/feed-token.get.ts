import { shiftsAccess } from '../../../access'
import type { ShiftFeedStatusDto } from '../../../../types'

// Whether I have a live calendar feed, and when it was made and last read. Session only (`shifts:feed`); the secret
// itself is never shown again.
export default defineEventHandler(async (event): Promise<ShiftFeedStatusDto> => {
  const principal = await authorize(event, shiftsAccess.permissions.feed)
  setResponseHeader(event, 'cache-control', 'no-store')
  return shiftsFeedStatus(Number(principal.user.id))
})
