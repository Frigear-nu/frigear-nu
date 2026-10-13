import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core'

// Credentials (`password`, `emailVerifiedAt`, `lastLoginAt`) are added by `@frigear-nu/auth`, other modules extend the
// table with their own columns.
export const users = sqliteTable('users', {
  id: integer().primaryKey({ autoIncrement: true }),
  name: text().notNull(),
  email: text().notNull().unique(),
  avatar: text(),
  acceptedTermsAt: integer('accepted_terms_at'),
  createdAt: integer({ mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
  updatedAt: integer({ mode: 'timestamp' }).notNull().$onUpdateFn(() => new Date()),
})
