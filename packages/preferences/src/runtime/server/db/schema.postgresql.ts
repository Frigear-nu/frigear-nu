import { pgTable, jsonb } from 'drizzle-orm/pg-core'

// Every preference lives in this one column, so adding a preference never needs a migration.
export const users = pgTable('users', {
  preferences: jsonb('preferences').$type<Record<string, unknown>>(),
})
