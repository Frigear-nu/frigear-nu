import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core'

// Credential columns this module adds to the `users` table owned by `@frigear-nu/users`. Without that module the
// extension has nothing to attach to and is ignored.
export const users = sqliteTable('users', {
  password: text(),
  emailVerifiedAt: integer({ mode: 'timestamp' }),
  lastLoginAt: integer({ mode: 'timestamp' }),
  // Bumped to end every session of the user (a password or email change); sessions are stamped with it at sign-in.
  sessionVersion: integer().notNull().default(0),
})
