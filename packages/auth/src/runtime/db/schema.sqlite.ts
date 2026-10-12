import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core'

// There is deliberately no foreign key to `users`: this module sits below it and only knows the id as text.

/** Static API tokens a user creates to call the API as themselves. Only the SHA-256 of a token is stored. */
export const authUserTokens = sqliteTable('auth_user_tokens', {
  /** `aut_` + random id. */
  id: text().primaryKey(),
  userId: text().notNull(),
  name: text().notNull(),
  tokenHash: text().notNull().unique(),
  /** First characters of the token, for display. */
  prefix: text().notNull(),
  last4: text().notNull(),
  scopes: text({ mode: 'json' }).$type<string[]>().notNull().$defaultFn(() => []),
  expiresAt: integer({ mode: 'timestamp' }),
  lastUsedAt: integer({ mode: 'timestamp' }),
  revokedAt: integer({ mode: 'timestamp' }),
  createdAt: integer({ mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
}, t => [
  index('auth_user_tokens_user_idx').on(t.userId),
])
