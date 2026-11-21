// Test-only: turns the station key off (`{ configured: false }`) or back on for the requests that follow.
export default defineEventHandler(async (event) => {
  const { configured } = await readBody<{ configured: boolean }>(event)
  testStationKey.off = !configured
  return { ok: true }
})
