import { pgTable, text } from 'drizzle-orm/pg-core'

export const users = pgTable('users', {
  role: text('role').notNull().default('user'),
})
