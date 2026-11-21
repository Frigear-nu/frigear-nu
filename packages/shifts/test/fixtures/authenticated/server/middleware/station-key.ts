// Test-only: drops the station key from the request's runtime config while `testStationKey.off` is set, so one server
// can answer both with and without `NUXT_SHIFTS_STATION_KEY`. `useRuntimeConfig(event)` is a per-request copy.
export default defineEventHandler((event) => {
  if (!testStationKey.off) return
  const config = useRuntimeConfig(event) as unknown as { shifts: { stationKey: string } }
  config.shifts.stationKey = ''
})
