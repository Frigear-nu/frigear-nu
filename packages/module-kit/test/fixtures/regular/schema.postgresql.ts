import { integer, pgTable, text } from 'drizzle-orm/pg-core'

export const accounts = pgTable('accounts', {
  id: integer().primaryKey(),
  name: text().notNull(),
})
