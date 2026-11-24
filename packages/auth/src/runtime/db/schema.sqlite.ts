import { sqliteTable, text, integer, index, uniqueIndex } from 'drizzle-orm/sqlite-core'

// There is deliberately no foreign key to `users`: this module sits below it and does not know its table. Whoever
// removes a user removes these rows too (see `deleteUserCredentials`).

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
  /** The permissions the scopes stood for, within its user's, frozen when it was minted. `null`: minted before. */
  permissions: text({ mode: 'json' }).$type<string[]>(),
  expiresAt: integer({ mode: 'timestamp' }),
  lastUsedAt: integer({ mode: 'timestamp' }),
  revokedAt: integer({ mode: 'timestamp' }),
  createdAt: integer({ mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
}, t => [
  index('auth_user_tokens_user_idx').on(t.userId),
])

// WebAuthn credentials (passkeys). `id` is the base64url credential id issued by the authenticator.
export const userCredentials = sqliteTable('user_credentials', {
  id: text().primaryKey(),
  userId: integer().notNull(),
  publicKey: text().notNull(),
  counter: integer().notNull().default(0),
  backedUp: integer({ mode: 'boolean' }).notNull().default(false),
  transports: text({ mode: 'json' }).$type<string[]>(),
  name: text(),
  createdAt: integer({ mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
}, t => [
  index('user_credential_user_idx').on(t.userId),
])

export const passwordResets = sqliteTable('password_resets', {
  id: integer().primaryKey({ autoIncrement: true }),
  userId: integer().notNull(),
  code: text().notNull().unique(),
  expiresAt: integer({ mode: 'timestamp' }).notNull(),
  usedAt: integer({ mode: 'timestamp' }),
  createdAt: integer({ mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
}, t => [
  index('password_reset_user_idx').on(t.userId),
])

/** Single-use sign-in links. Verification emails are magic links too. */
export const magicLinks = sqliteTable('magic_links', {
  id: integer().primaryKey({ autoIncrement: true }),
  userId: integer().notNull(),
  code: text().notNull().unique(),
  redirectUrl: text(),
  expiresAt: integer({ mode: 'timestamp' }).notNull(),
  usedAt: integer({ mode: 'timestamp' }),
  createdAt: integer({ mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
}, t => [
  index('magic_link_user_idx').on(t.userId),
])

/**
 * OAuth tokens kept from sign-ins (`keepTokens` on a provider), so the app can call the provider as the user, also
 * from tasks and bearer requests. One row per user and provider; every login replaces it. The token columns are
 * encrypted (AES-GCM, see `oauth-tokens.ts`).
 */
export const authOAuthTokens = sqliteTable('auth_oauth_tokens', {
  id: integer().primaryKey({ autoIncrement: true }),
  userId: integer().notNull(),
  /** The provider key: `frigear`, `github`, `oidc`, ... */
  provider: text().notNull(),
  accessToken: text().notNull(),
  refreshToken: text(),
  tokenType: text(),
  scopes: text({ mode: 'json' }).$type<string[]>().notNull().$defaultFn(() => []),
  expiresAt: integer({ mode: 'timestamp' }),
  createdAt: integer({ mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
  updatedAt: integer({ mode: 'timestamp' }).notNull().$defaultFn(() => new Date()).$onUpdateFn(() => new Date()),
}, t => [
  uniqueIndex('auth_oauth_tokens_user_provider_idx').on(t.userId, t.provider),
])

/**
 * "Log in with frigear.nu" handed off to the system browser (`oauth.frigear.handoff`, a desktop app): the window starts
 * an attempt, the browser signs in at frigear.nu and lands on `/auth/frigear`, and the window, which waits, collects
 * the session. Only hashes of the window's secret and of the `state` are stored, and the PKCE verifier encrypted. Rows
 * live 10 minutes and are removed when the window collects or cancels them, and when later attempts start.
 */
export const authFrigearHandoffs = sqliteTable('auth_frigear_handoffs', {
  /** `afh_` + random id, named in the routes. */
  id: text().primaryKey(),
  /** SHA-256 of the secret in the window's httpOnly cookie. */
  secretHash: text().notNull(),
  /** SHA-256 of the OAuth `state` sent to frigear.nu, how the browser callback finds the attempt. */
  stateHash: text().notNull().unique(),
  /** The PKCE `code_verifier`, encrypted (AES-GCM, key from `appSecret`), only ever sent to frigear.nu's token endpoint. */
  codeVerifier: text().notNull(),
  nonce: text().notNull(),
  redirectUri: text().notNull(),
  /** Where the window goes once signed in (a path on this site). */
  redirectTo: text(),
  /** `pending`, `exchanging` (the browser came back), `complete` or `failed`. */
  status: text().notNull().default('pending'),
  /** Why it failed: `access_denied`, `oauth-unverified`, `exchange_failed`, ... */
  error: text(),
  userId: integer(),
  /** The extra session data of the sign-in (`frigear: { id, colorMode, loggedInAt }`). */
  sessionData: text({ mode: 'json' }).$type<Record<string, unknown>>(),
  expiresAt: integer({ mode: 'timestamp' }).notNull(),
  createdAt: integer({ mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
}, t => [
  index('auth_frigear_handoffs_expires_idx').on(t.expiresAt),
])
