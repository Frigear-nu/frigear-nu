import { pgTable, text, timestamp } from 'drizzle-orm/pg-core'

// Credential columns this module adds to the `users` table owned by `@frigear-nu/users`. Without that module the
// extension has nothing to attach to and is ignored.
export const users = pgTable('users', {
  password: text(),
  emailVerifiedAt: timestamp({ withTimezone: true }),
  lastLoginAt: timestamp({ withTimezone: true }),
})
