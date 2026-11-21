// Test-only: the operations the caller (cookie or bearer) takes part in, as operations asks crew through
// `operations:participation:resolve`, and with `?operationId=` how the `operation` grant answers for that operation:
// whether it admits the caller, and who it lists.
export default defineEventHandler(async (event) => {
  const principal = await requireAuth(event)
  const { operationId } = getQuery(event) as { operationId?: string }
  const grants = operationId ? [{ kind: 'operation', operationId }] : []
  return {
    operationIds: await operationsParticipationOf(event, principal.user.id),
    matches: await grantsMatch(event, principal.user, grants),
    members: (await grantsMembers(event, grants)).map(Number),
  }
})
