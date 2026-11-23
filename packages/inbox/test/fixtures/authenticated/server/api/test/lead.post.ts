import { z } from 'zod'

// Test-only: makes the signed-in caller a lead of a team, as teams' `isTeamLead` would answer.
export default defineEventHandler(async (event) => {
  const principal = await requireAuth(event)
  const { teamId } = await readValidatedBody(event, z.object({ teamId: z.string() }).parse)
  const led = testLeads.get(String(principal.user.id)) ?? new Set<string>()
  led.add(teamId)
  testLeads.set(String(principal.user.id), led)
  return { ok: true }
})
