import { z } from 'zod'

// Test-only: says which users `help-center:audience:resolve` returns for an operation or a team id.
export default defineEventHandler(async (event) => {
  const body = await readValidatedBody(event, z.object({ key: z.string(), userIds: z.array(z.string()) }).parse)
  testAudiences.set(body.key, body.userIds)
  return { ok: true }
})
