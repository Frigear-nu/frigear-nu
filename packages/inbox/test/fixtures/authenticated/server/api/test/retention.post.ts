import { z } from 'zod'

// Test-only: runs the `inbox:retention` task as of `now`, optionally in another mode.
export default defineEventHandler(async (event) => {
  const { now, mode } = await readValidatedBody(event, z.object({ now: z.string(), mode: z.enum(['delete', 'anonymise']).optional() }).parse)
  return runTask('inbox:retention', { payload: { now, mode } })
})
