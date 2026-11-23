// Test-only: whether the caller leads `?teamId=` (`teams:lead` with its policy), and the server helper's answer, the
// way another module's policy asks.
export default defineEventHandler(async (event) => {
  const principal = await requireAuth(event)
  const { teamId = '' } = getQuery(event) as { teamId?: string }
  return {
    allowed: await allows(event, 'teams:lead', { teamId }),
    isTeamLead: await isTeamLead(event, principal.user.id, teamId),
  }
})
