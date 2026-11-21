import { z } from 'zod'

// Test-only: makes the signed-in caller "take part in" an operation (see `server/plugins/test-listeners.ts`).
export default defineEventHandler(async (event) => {
  const principal = await requireAuth(event)
  const { operationId } = await readValidatedBody(event, z.object({ operationId: z.string() }).parse)
  testParticipate(principal.user.id, operationId)
  return { ok: true }
})
