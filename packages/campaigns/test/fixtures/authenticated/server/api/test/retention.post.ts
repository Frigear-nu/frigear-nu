// Test-only: runs the `campaigns:retention` task once (`now` as its payload).
export default defineEventHandler(async (event) => {
  const body = await readBody<{ now?: string } | undefined>(event)
  return runTask('campaigns:retention', { payload: { ...body } })
})
