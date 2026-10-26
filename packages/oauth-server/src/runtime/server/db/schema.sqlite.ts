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
  /** Origin of the application, no path. The redirect URI is derived from it. */
  websiteUrl: text().notNull(),
  /** Where "open application" links go; defaults to the website URL. */
  loginUrl: text(),
  /** e.g. `https://*.vercel.app`: preview deployments that may use the callback too. */
  previewUrlPattern: text(),
  /** Extra exact redirect URIs. */
  redirectUris: text({ mode: 'json' }).$type<string[]>().notNull().$defaultFn(() => []),
  /** Roles allowed to sign in. Empty = every signed-in user. Roles are resolved by the host (`oauth:user:roles`). */
  allowedRoles: text({ mode: 'json' }).$type<string[]>().notNull().$defaultFn(() => []),
  tags: text({ mode: 'json' }).$type<string[]>().notNull().$defaultFn(() => []),
  ownerId: integer(),
  isActive: integer({ mode: 'boolean' }).notNull().default(true),
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
