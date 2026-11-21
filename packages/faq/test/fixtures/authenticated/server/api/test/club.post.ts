import { z } from 'zod'

// Test-only: puts the signed-in caller in a club of the fixture's `club` grant kind.
export default defineEventHandler(async (event) => {
  const principal = await requireAuth(event)
  const { clubId } = await readValidatedBody(event, z.object({ clubId: z.string() }).parse)
  testJoinClub(principal.user.id, clubId)
  return { ok: true }
})
