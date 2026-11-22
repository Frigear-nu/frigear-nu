import { pgTable, text, index } from 'drizzle-orm/pg-core'

export const members = pgTable('members', {
  id: text().primaryKey(),
  teamId: text().notNull(),
}, t => [
  index('member_team_idx').on(t.teamId),
])
