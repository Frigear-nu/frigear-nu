// Test-only: how a `team` grant (`?teamId=&minRole=`, or `?teamKind=&minRole=` for every team of a kind) evaluates, the
// way a content module asks through `@frigear-nu/auth`: for the caller (cookie or bearer), or for `?userId=` (another
// user, as a send does), and who it lists. `valid` is what `grantsValidate` says before it is stored.
export default defineEventHandler(async (event) => {
  const principal = await requireAuth(event)
  const { teamId, teamKind, minRole = '', userId } = getQuery(event) as { teamId?: string, teamKind?: string, minRole?: string, userId?: string }
  const user = userId ? await loadAuthUser(userId) : principal.user
  if (!user) throw createError({ statusCode: 404 })
  const grants = [teamKind !== undefined ? { kind: 'team', teamKind, minRole } : { kind: 'team', teamId: teamId ?? '', minRole }]
  const valid = await grantsValidate(event, grants).then(() => true, () => false)
  return {
    matches: await grantsMatch(event, user, grants),
    members: (await grantsMembers(event, grants)).map(Number),
    valid,
  }
})
