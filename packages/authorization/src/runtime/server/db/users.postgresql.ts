import { pgTable, text } from 'drizzle-orm/pg-core'

// `users.role`: the single stored role of earlier releases. Kept this release only so the role migration
// (`runAuthorizationRoleMigration`) can copy it into `authorization_user_roles`; nothing reads it at runtime any more.
// Dropped in the next release.
export const users = pgTable('users', {
  role: text('role').notNull().default('user'),
})
