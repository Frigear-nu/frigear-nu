import { z } from 'zod'

// Test-only: makes users take part in an operation, for the fixture's `operation` grant kind.
export default defineEventHandler(async (event) => {
  const body = await readValidatedBody(event, z.object({ operationId: z.string(), userIds: z.array(z.string()) }).parse)
  testTakePart(body.operationId, body.userIds)
  return { ok: true }
})
