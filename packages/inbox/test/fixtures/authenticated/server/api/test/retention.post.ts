import { z } from 'zod'

// Test-only: runs the `inbox:retention` task as of `now`, optionally in another mode or with another batch.
export default defineEventHandler(async (event) => {
  const { now, mode, batch } = await readValidatedBody(event, z.object({ now: z.string(), mode: z.enum(['delete', 'anonymise']).optional(), batch: z.number().int().positive().optional() }).parse)
  return runTask('inbox:retention', { payload: { now, mode, batch } })
})
