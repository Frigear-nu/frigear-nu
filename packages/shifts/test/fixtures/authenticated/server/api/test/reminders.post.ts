// Test-only: runs the reminder task as the scheduler would (no request, so no event) with a fake `now`, optionally with
// `sms` and `offsets` overridden.
export default defineEventHandler(async (event) => {
  const { now, sms, offsets } = await readBody<{ now: string, sms?: boolean, offsets?: number[] }>(event)
  return shiftsSendReminders(new Date(now), undefined, { sms, offsets })
})
