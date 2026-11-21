/** A crew member: a `team_members` row, or any record that names the person and their team. */
type CrewRecord = { userId: number, teamId: string }

// The record rule of crew (registered with `addPolicies` in `module.ts`). A policy only narrows: signed-in users hold
// `crew:read` implicitly, this decides which crew members that covers.
export default [
  // A crew member is readable by the person themselves, by the leads of their team (`ba` and up on a bar team, see
  // `isTeamLead` of teams) and by staff with `crew:manage`.
  definePolicy<CrewRecord>('crew:read', async ({ event, user, record }) => {
    if (!record) return undefined
    // Without a record, so this check does not run the record policies again.
    if (await allows(event, 'crew:manage')) return true
    if (Number(user.id) === record.userId) return true
    return isTeamLead(event, user.id, record.teamId)
  }),
]
