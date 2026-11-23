import { created } from '@frigear-nu/module-kit/server'
import { shiftsAccess } from '../../../access'
import type { ShiftFeedTokenDto } from '../../../../types'

// Mints my calendar feed: one secret URL (`https` and `webcal://`) that lists my shifts as an iCal feed. Any earlier one
// is revoked. The secret is in the answer once and is stored hashed. Session only (`shifts:feed`): a token cannot mint
// one.
export default defineEventHandler(async (event): Promise<ShiftFeedTokenDto> => {
  const principal = await authorize(event, shiftsAccess.permissions.feed)
  setResponseHeader(event, 'cache-control', 'no-store')
  return created(event, await shiftsMintFeedToken(event, Number(principal.user.id)))
})
