import { assertShiftsStationKey } from '../../utils/station-key'

// Refuses to start with a station key shorter than 32 characters (`NUXT_SHIFTS_STATION_KEY`): station codes signed with
// a short key are easy to forge. An empty key is fine: station check-in is then off. Runtimes that only hand the
// environment to a request (Cloudflare) are checked on every read too (`shiftsStationSecret`).
export default defineNitroPlugin(() => {
  const config = useRuntimeConfig() as { shifts?: { stationKey?: unknown } }
  assertShiftsStationKey(config.shifts?.stationKey)
})
