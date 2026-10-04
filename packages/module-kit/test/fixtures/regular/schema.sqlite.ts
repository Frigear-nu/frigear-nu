import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'

export const accounts = sqliteTable('accounts', {
  id: integer().primaryKey(),
  name: text().notNull(),
})
