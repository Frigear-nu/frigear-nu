import { sqliteTable, text } from 'drizzle-orm/sqlite-core'

// Every preference lives in this one column, so adding a preference never needs a migration.
export const users = sqliteTable('users', {
  preferences: text('preferences', { mode: 'json' }).$type<Record<string, unknown>>(),
})
