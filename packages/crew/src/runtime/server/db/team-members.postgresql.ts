import { pgTable, text, integer, timestamp } from 'drizzle-orm/pg-core'

// What crew adds to a team membership. A row with a `crewStatus` is a crew membership: `applied`, `waitlisted`,
// `approved`, `rejected` or `withdrawn`. Teams' own `status` follows it (`pending`, `active`, `inactive`), so only an
// approved person holds the role. Rows added by hand in teams have no `crewStatus`.
export const teamMembers = pgTable('team_members', {
  crewStatus: text(),
  appliedAt: timestamp({ withTimezone: true }),
  decidedAt: timestamp({ withTimezone: true }),
  /** The staff user who approved, rejected or waitlisted. */
  decidedBy: integer(),
  /** The forms submission of the application. */
  submissionId: text(),
  /** Place on the waiting list, 1 first; `null` when not waitlisted. */
  waitlistPosition: integer(),
})
