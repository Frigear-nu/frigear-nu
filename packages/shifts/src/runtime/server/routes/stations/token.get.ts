import { idParams } from '@frigear-nu/module-kit/server'
import { shiftsAccess } from '../../../access'
import type { ShiftStationTokenDto, Translated } from '../../../../types'

// The current QR code of a check-in station, for its full-screen display: a lead of the station's team, or staff. The
// token changes every 30 seconds; the page fetches a new one at `refreshAt`.
export default defineEventHandler(async (event): Promise<ShiftStationTokenDto> => {
  await authorize(event, shiftsAccess.permissions.lead)
  const { stationId } = await getValidatedRouterParams(event, idParams('stationId').parse)
  const station = await getShiftStationOr404(stationId)
  await authorize(event, shiftsAccess.permissions.lead, { teamId: station.teamId })
  setResponseHeader(event, 'cache-control', 'no-store')
  const teams = await shiftsTeamsById([station.teamId])
  return shiftsStationTokenDto(event, station, (teams.get(station.teamId)?.name ?? station.teamId) as Translated)
})
