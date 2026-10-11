import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core'

// One row per "change my email" request. The new address is only applied once `code` (sent to the new
// address) is used; the old address then receives a notice with `revertCode` to undo it.
export const accountEmailChanges = sqliteTable('account_email_changes', {
  id: integer().primaryKey({ autoIncrement: true }),
  userId: integer().notNull(),
  oldEmail: text().notNull(),
  newEmail: text().notNull(),
  code: text().notNull().unique(),
  revertCode: text().notNull().unique(),
  expiresAt: integer({ mode: 'timestamp' }).notNull(),
  verifiedAt: integer({ mode: 'timestamp' }),
  revertExpiresAt: integer({ mode: 'timestamp' }),
  revertedAt: integer({ mode: 'timestamp' }),
  createdAt: integer({ mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
}, t => [
  index('account_email_change_user_idx').on(t.userId),
])
