import { z } from 'zod'

// Test-only: tells `audience:viewer:resolve` which operations and team roles the signed-in caller has.
export default defineEventHandler(async (event) => {
  const principal = await requireAuth(event)
  const body = await readValidatedBody(event, z.object({
    operationIds: z.array(z.string()).optional(),
    teamRoles: z.array(z.object({
      ownerType: z.string(),
      ownerId: z.string().nullable(),
      teamId: z.string(),
      kind: z.string(),
      role: z.string(),
      source: z.enum(['explicit', 'mapped']),
    })).optional(),
  }).parse)
  testSetViewer(principal.user.id, body)
  return { ok: true }
})
