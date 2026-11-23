import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core'

// Credentials (`password`, `emailVerifiedAt`, `lastLoginAt`) are added by `@frigear-nu/auth`, other modules extend the
// table with their own columns.
export const users = sqliteTable('users', {
  id: integer().primaryKey({ autoIncrement: true }),
  name: text().notNull(),
  // `name` folded for search (`searchText` of `@frigear-nu/module-kit/server`), written with it: `searchUserRefs` and
  // other modules' user searches match it.
  searchText: text().notNull().default(''),
  email: text().notNull().unique(),
  avatar: text(),
  // Personal data: shown to staff with `users:pii` only, and to other modules' staff through their own `:pii`.
  phone: text(),
  // The user's language (an i18n locale code such as `da`, or a short BCP-47 tag): messages to them use it.
  locale: text(),
  acceptedTermsAt: integer('accepted_terms_at'),
  createdAt: integer({ mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
  updatedAt: integer({ mode: 'timestamp' }).notNull().$onUpdateFn(() => new Date()),
})
