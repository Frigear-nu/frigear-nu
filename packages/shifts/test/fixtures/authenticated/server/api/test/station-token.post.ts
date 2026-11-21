import { stationWindow } from '../../../../../../src/runtime/utils/checkin'

// Test-only: the token of a station for a window `offset` windows from now (negative: an old one), signed with the real
// key, so the tests can try an expired or a previous-window token without waiting.
export default defineEventHandler(async (event) => {
  const { stationId, offset } = await readBody<{ stationId: string, offset?: number }>(event)
  return { token: await shiftsStationToken(event, stationId, stationWindow(Date.now()) + (offset ?? 0)) }
})
