// Test-only: runs the close task as the scheduler would (no request, so no event) with a fake `now`.
export default defineEventHandler(async (event) => {
  const { now, batchSize } = await readBody<{ now: string, batchSize?: number }>(event)
  return shiftsCloseShifts(new Date(now), undefined, { batchSize })
})
