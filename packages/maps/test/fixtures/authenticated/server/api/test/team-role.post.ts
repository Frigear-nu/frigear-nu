import { z } from 'zod'

// Test-only: gives the signed-in caller a team role, as teams would report it through `audience:viewer:resolve`.
export default defineEventHandler(async (event) => {
  const principal = await requireAuth(event)
  const { kind, role } = await readValidatedBody(event, z.object({ kind: z.string(), role: z.string() }).parse)
  testGrantTeamRole(principal.user.id, kind, role)
  return { ok: true }
})
