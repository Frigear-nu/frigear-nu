// Test-only: how a `team` grant (`?teamId=&minRole=`) evaluates, the way a content module asks through
// `@frigear-nu/auth`: for the caller (cookie or bearer), or for `?userId=` (another user, as a send does), and who it
// lists.
export default defineEventHandler(async (event) => {
  const principal = await requireAuth(event)
  const { teamId = '', minRole = '', userId } = getQuery(event) as { teamId?: string, minRole?: string, userId?: string }
  const user = userId ? await loadAuthUser(userId) : principal.user
  if (!user) throw createError({ statusCode: 404 })
  const grants = [{ kind: 'team', teamId, minRole }]
  return {
    matches: await grantsMatch(event, user, grants),
    members: (await grantsMembers(event, grants)).map(Number),
  }
})
