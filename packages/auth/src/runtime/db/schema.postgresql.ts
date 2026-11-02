import { pgTable, text, integer, serial, boolean, jsonb, timestamp, index, uniqueIndex } from 'drizzle-orm/pg-core'

// There is deliberately no foreign key to `users`: this module sits below it and does not know its table. Whoever
// removes a user removes these rows too (see `deleteUserCredentials`).

/** Static API tokens a user creates to call the API as themselves. Only the SHA-256 of a token is stored. */
export const authUserTokens = pgTable('auth_user_tokens', {
  /** `aut_` + random id. */
  id: text().primaryKey(),
  userId: text().notNull(),
  name: text().notNull(),
  tokenHash: text().notNull().unique(),
  /** First characters of the token, for display. */
  prefix: text().notNull(),
  last4: text().notNull(),
  scopes: jsonb().$type<string[]>().notNull().$defaultFn(() => []),
  expiresAt: timestamp({ withTimezone: true }),
  lastUsedAt: timestamp({ withTimezone: true }),
  revokedAt: timestamp({ withTimezone: true }),
  createdAt: timestamp({ withTimezone: true }).notNull().$defaultFn(() => new Date()),
}, t => [
  index('auth_user_tokens_user_idx').on(t.userId),
])

// WebAuthn credentials (passkeys). `id` is the base64url credential id issued by the authenticator.
export const userCredentials = pgTable('user_credentials', {
  id: text().primaryKey(),
  userId: integer().notNull(),
  publicKey: text().notNull(),
  counter: integer().notNull().default(0),
  backedUp: boolean().notNull().default(false),
  transports: jsonb().$type<string[]>(),
  name: text(),
  createdAt: timestamp({ withTimezone: true }).notNull().$defaultFn(() => new Date()),
}, t => [
  index('user_credential_user_idx').on(t.userId),
])

export const passwordResets = pgTable('password_resets', {
  id: serial().primaryKey(),
  userId: integer().notNull(),
  code: text().notNull().unique(),
  expiresAt: timestamp({ withTimezone: true }).notNull(),
  usedAt: timestamp({ withTimezone: true }),
  createdAt: timestamp({ withTimezone: true }).notNull().$defaultFn(() => new Date()),
}, t => [
  index('password_reset_user_idx').on(t.userId),
])

/** Single-use sign-in links. Verification emails are magic links too. */
export const magicLinks = pgTable('magic_links', {
  id: serial().primaryKey(),
  userId: integer().notNull(),
  code: text().notNull().unique(),
  redirectUrl: text(),
  expiresAt: timestamp({ withTimezone: true }).notNull(),
  usedAt: timestamp({ withTimezone: true }),
  createdAt: timestamp({ withTimezone: true }).notNull().$defaultFn(() => new Date()),
}, t => [
  index('magic_link_user_idx').on(t.userId),
])

/**
 * OAuth tokens kept from sign-ins (`keepTokens` on a provider), so the app can call the provider as the user, also
 * from tasks and bearer requests. One row per user and provider; every login replaces it. The token columns are
 * encrypted (AES-GCM, see `oauth-tokens.ts`).
 */
export const authOAuthTokens = pgTable('auth_oauth_tokens', {
  id: serial().primaryKey(),
  userId: integer().notNull(),
  /** The provider key: `frigear`, `github`, `oidc`, ... */
  provider: text().notNull(),
  accessToken: text().notNull(),
  refreshToken: text(),
  tokenType: text(),
  scopes: jsonb().$type<string[]>().notNull().$defaultFn(() => []),
  expiresAt: timestamp({ withTimezone: true }),
  createdAt: timestamp({ withTimezone: true }).notNull().$defaultFn(() => new Date()),
  updatedAt: timestamp({ withTimezone: true }).notNull().$defaultFn(() => new Date()).$onUpdateFn(() => new Date()),
}, t => [
  uniqueIndex('auth_oauth_tokens_user_provider_idx').on(t.userId, t.provider),
])
