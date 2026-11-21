import { z } from 'zod'

// Test-only: gives the signed-in caller a plan, the way an active subscription would (see `server/plugins/test-listeners.ts`).
export default defineEventHandler(async (event) => {
  const principal = await requireAuth(event)
  const { plan } = await readValidatedBody(event, z.object({ plan: z.string() }).parse)
  testGivePlan(principal.user.id, plan)
  return { ok: true }
})
