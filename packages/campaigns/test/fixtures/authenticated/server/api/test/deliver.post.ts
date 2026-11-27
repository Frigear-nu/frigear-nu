// Test-only: runs the `campaigns:deliver` task once (`now` and `batchSize` as its payload).
export default defineEventHandler(async (event) => {
  const body = await readBody<{ now?: string, batchSize?: number } | undefined>(event)
  return runTask('campaigns:deliver', { payload: { ...body } })
})
