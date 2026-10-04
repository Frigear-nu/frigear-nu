import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core'

export const users = sqliteTable('users', {
  id: integer().primaryKey({ autoIncrement: true }),
  name: text().notNull(),
})

export const userPasskeys = sqliteTable('user_passkeys', {
  id: integer().primaryKey({ autoIncrement: true }),
  userId: integer().notNull().references(() => users.id, { onDelete: 'cascade' }),
}, t => [
  index('user_passkey_user_idx').on(t.userId),
])
