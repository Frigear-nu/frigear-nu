import { pgTable, text, serial, bigint, timestamp } from 'drizzle-orm/pg-core'

// Credentials (`password`, `emailVerifiedAt`, `lastLoginAt`) are added by `@frigear-nu/auth`, other modules extend the
// table with their own columns.
export const users = pgTable('users', {
  id: serial().primaryKey(),
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
  acceptedTermsAt: bigint('accepted_terms_at', { mode: 'number' }),
  createdAt: timestamp({ withTimezone: true }).notNull().$defaultFn(() => new Date()),
  updatedAt: timestamp({ withTimezone: true }).notNull().$onUpdateFn(() => new Date()),
})
