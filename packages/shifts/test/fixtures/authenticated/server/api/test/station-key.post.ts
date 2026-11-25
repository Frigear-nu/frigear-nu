// Test-only: turns the station key off (`{ configured: false }`) or back on for the requests that follow; with
// `appSecret: true` only the station key goes, so the key derived from the app secret signs.
export default defineEventHandler(async (event) => {
  const { configured, appSecret } = await readBody<{ configured: boolean, appSecret?: boolean }>(event)
  testStationKey.off = !configured
  testStationKey.keepAppSecret = appSecret === true
  return { ok: true }
})
