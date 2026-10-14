import { pgTable, text, serial, bigint, timestamp } from 'drizzle-orm/pg-core'

// Credentials (`password`, `emailVerifiedAt`, `lastLoginAt`) are added by `@frigear-nu/auth`, other modules extend the
// table with their own columns.
export const users = pgTable('users', {
  id: serial().primaryKey(),
  name: text().notNull(),
  email: text().notNull().unique(),
  avatar: text(),
  acceptedTermsAt: bigint('accepted_terms_at', { mode: 'number' }),
  createdAt: timestamp({ withTimezone: true }).notNull().$defaultFn(() => new Date()),
  updatedAt: timestamp({ withTimezone: true }).notNull().$onUpdateFn(() => new Date()),
})
