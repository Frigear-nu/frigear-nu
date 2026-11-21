import { z } from 'zod'

// Test-only: runs the `inbox:retention` task as of `now`.
export default defineEventHandler(async (event) => {
  const { now } = await readValidatedBody(event, z.object({ now: z.string() }).parse)
  return runTask('inbox:retention', { payload: { now } })
})
