import { z } from 'zod'

// Test-only: makes the signed-in caller "take part" in an operation (see `server/plugins/test-listeners.ts`): through an
// operation id (the default), an explicit team grant, or a mapped team grant.
export default defineEventHandler(async (event) => {
  const principal = await requireAuth(event)
  const { operationId, kind } = await readValidatedBody(event, z.object({
    operationId: z.string(),
    kind: z.enum(['id', 'explicit', 'mapped']).optional(),
  }).parse)
  testParticipate(principal.user.id, operationId, kind)
  return { ok: true }
})
