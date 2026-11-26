// Runs the retention task as of `now` (fixture only).
export default defineEventHandler(async (event) => {
  const { now } = await readBody<{ now: string }>(event)
  return runTask('short-links:retention', { payload: { now } })
})
