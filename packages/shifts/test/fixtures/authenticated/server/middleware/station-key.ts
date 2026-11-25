// Test-only: drops the station key from the request's runtime config while `testStationKey.off` is set, so one server
// can answer both with and without `NUXT_SHIFTS_STATION_KEY`, and the app secret too unless `keepAppSecret` (the dev
// server generates one). `useRuntimeConfig(event)` is a per-request copy; sessions read the shared one, so they keep working.
export default defineEventHandler((event) => {
  if (!testStationKey.off) return
  const config = useRuntimeConfig(event) as unknown as { appSecret?: string, shifts: { stationKey: string } }
  config.shifts.stationKey = ''
  if (!testStationKey.keepAppSecret) config.appSecret = ''
})
