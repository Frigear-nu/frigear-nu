import { pgTable, text, integer, serial, timestamp, index } from 'drizzle-orm/pg-core'

// One row per "change my email" request. The new address is only applied once `code` (sent to the new
// address) is used; the old address then receives a notice with `revertCode` to undo it.
export const accountEmailChanges = pgTable('account_email_changes', {
  id: serial().primaryKey(),
  userId: integer().notNull(),
  oldEmail: text().notNull(),
  newEmail: text().notNull(),
  code: text().notNull().unique(),
  revertCode: text().notNull().unique(),
  expiresAt: timestamp({ withTimezone: true }).notNull(),
  verifiedAt: timestamp({ withTimezone: true }),
  revertExpiresAt: timestamp({ withTimezone: true }),
  revertedAt: timestamp({ withTimezone: true }),
  createdAt: timestamp({ withTimezone: true }).notNull().$defaultFn(() => new Date()),
}, t => [
  index('account_email_change_user_idx').on(t.userId),
])
