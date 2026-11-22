import { sqliteTable, text, index } from 'drizzle-orm/sqlite-core'

export const members = sqliteTable('members', {
  id: text().primaryKey(),
  teamId: text().notNull(),
}, t => [
  index('member_team_idx').on(t.teamId),
])
