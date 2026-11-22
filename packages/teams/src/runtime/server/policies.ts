import type { TeamRow } from './utils/teams'

/** A team row, or any record that names its team (`{ teamId }`, such as a shift of another module). */
type TeamRecord = Pick<TeamRow, 'id'> | { teamId: string }

const teamIdOf = (record: TeamRecord): string => 'teamId' in record ? record.teamId : record.id

// The record rules of teams (registered with `addPolicies` in `module.ts`). A policy only narrows: signed-in users hold
// `teams:read` and `teams:lead` implicitly, these decide which teams that covers.
export default [
  // A team is readable by its members (explicit or mapped) and by staff with `teams:manage`.
  definePolicy<TeamRecord>('teams:read', async ({ event, user, record }) => {
    if (!record) return undefined
    // Without a record, so this check does not run the record policies again.
    if (await allows(event, 'teams:manage')) return true
    return !!(await teamGrantOf(event, user.id, teamIdOf(record)))
  }),
  // A lead holds a role at or above the ladder's `leadFrom` on the record's team.
  definePolicy<TeamRecord>('teams:lead', async ({ event, user, record }) => {
    if (!record) return undefined
    return isTeamLead(event, user.id, teamIdOf(record))
  }),
]
