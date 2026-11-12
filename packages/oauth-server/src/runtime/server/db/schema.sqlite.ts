import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core'

// There are deliberately no foreign keys to `users`: that table is registered from another file.

/** An application (OAuth client) that users may sign in to. */
export const oauthApplications = sqliteTable('oauth_applications', {
  /** `app_` + random id; it is the OAuth `client_id`. */
  id: text().primaryKey(),
  /** `confidential` clients authenticate with a secret; `public` ones (native apps, SPAs) rely on PKCE alone. */
  clientType: text({ enum: ['confidential', 'public'] }).notNull().default('confidential'),
  /**
   * SHA-256 hex of the client secret. The secret itself is only shown once. Public clients have none: they get the hash
   * of a random value nobody ever sees, so the column stays `NOT NULL` (relaxing it would make SQLite rebuild this table,
   * which can cascade-delete the refresh tokens that reference it) and `clientType` decides whether it is ever checked.
   */
  secretHash: text().notNull(),
  name: text().notNull(),
  description: text(),
  icon: text(),
  priority: integer().notNull().default(0),
  /**
   * Origin of the application, no path. The redirect URI is derived from it. Empty for a public client without a
   * website (a native app); it stays `NOT NULL` for the same reason as `secretHash`. `toApplication` reads '' as `null`.
   */
  websiteUrl: text().notNull(),
  /** Where "open application" links go; defaults to the website URL. */
  loginUrl: text(),
  /** e.g. `https://*.vercel.app`: preview deployments that may use the callback too. */
  previewUrlPattern: text(),
  /** Extra exact redirect URIs. */
  redirectUris: text({ mode: 'json' }).$type<string[]>().notNull().$defaultFn(() => []),
  /** Roles allowed to sign in (the user's effective roles). Empty = every signed-in user. */
  allowedRoles: text({ mode: 'json' }).$type<string[]>().notNull().$defaultFn(() => []),
  tags: text({ mode: 'json' }).$type<string[]>().notNull().$defaultFn(() => []),
  /** May receive wildcard scopes (`*`, `resource:*`). */
  wildcardScopes: integer({ mode: 'boolean' }).notNull().default(false),
  ownerId: integer(),
  isActive: integer({ mode: 'boolean' }).notNull().default(true),
  /** Shown in the users' application list. Unlisted applications still sign in. */
  isListed: integer({ mode: 'boolean' }).notNull().default(true),
  /** Refresh tokens live this long unused, in seconds. `null` = the configured client's or the global policy. */
  refreshIdleTtl: integer(),
  /** A sign-in lives this long in total (from `authTime`), in seconds. `null` = the configured client's or the global policy. */
  refreshMaxAge: integer(),
  createdAt: integer({ mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
  updatedAt: integer({ mode: 'timestamp' }).notNull().$defaultFn(() => new Date()).$onUpdateFn(() => new Date()),
}, t => [
  index('oauth_application_active_idx').on(t.isActive, t.priority),
])

/** Short-lived, single-use authorization codes. Only the hash of the code is stored. */
export const oauthAuthorizationCodes = sqliteTable('oauth_authorization_codes', {
  codeHash: text().primaryKey(),
  applicationId: text().notNull().references(() => oauthApplications.id, { onDelete: 'cascade' }),
  userId: integer().notNull(),
  redirectUri: text().notNull(),
  scope: text().notNull(),
  /** The version of each database scope in `scope` when the user consented: a newer version needs consent again. */
  scopeVersions: text({ mode: 'json' }).$type<Record<string, number>>(),
  codeChallenge: text().notNull(),
  nonce: text(),
  /** When the user signed in / approved; becomes `auth_time` in the ID token. */
  authTime: integer({ mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
  expiresAt: integer({ mode: 'timestamp' }).notNull(),
}, t => [
  index('oauth_code_application_idx').on(t.applicationId),
])

/** Refresh tokens are rotated on use; reusing a rotated token revokes the whole chain. */
export const oauthRefreshTokens = sqliteTable('oauth_refresh_tokens', {
  id: text().primaryKey(),
  tokenHash: text().notNull().unique(),
  applicationId: text().notNull().references(() => oauthApplications.id, { onDelete: 'cascade' }),
  userId: integer().notNull(),
  scope: text().notNull(),
  /** The version of each database scope in `scope` when the user consented: a newer version needs consent again. */
  scopeVersions: text({ mode: 'json' }).$type<Record<string, number>>(),
  /** Shared by every token of one authorization, so a reuse can revoke them all. */
  familyId: text().notNull(),
  /** Id of the token that replaced this one when it was rotated. */
  replacedBy: text(),
  authTime: integer({ mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
  expiresAt: integer({ mode: 'timestamp' }).notNull(),
  revokedAt: integer({ mode: 'timestamp' }),
  createdAt: integer({ mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
}, t => [
  index('oauth_refresh_user_idx').on(t.userId, t.applicationId),
  index('oauth_refresh_family_idx').on(t.familyId),
])

/**
 * Named scopes staff manage in the admin UI, next to the ones of config and modules (`addScope`). A scope stands for
 * its permissions; it may never contain sensitive or `sessionOnly` ones.
 */
export const oauthScopes = sqliteTable('oauth_scopes', {
  /** A single lower-case word, e.g. `tickets`. */
  name: text().primaryKey(),
  label: text(),
  description: text(),
  icon: text(),
  /** Permissions or wildcards (`tickets:read`, `tickets:*`). */
  permissions: text({ mode: 'json' }).$type<string[]>().notNull().$defaultFn(() => []),
  /** Bumped whenever the permissions it expands to grow, so users are asked to consent again. */
  version: integer().notNull().default(1),
  isActive: integer({ mode: 'boolean' }).notNull().default(true),
  createdAt: integer({ mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
  updatedAt: integer({ mode: 'timestamp' }).notNull().$defaultFn(() => new Date()).$onUpdateFn(() => new Date()),
})
