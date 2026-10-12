import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core'

export const users = sqliteTable('users', {
  id: integer().primaryKey({ autoIncrement: true }),
  name: text().notNull(),
  email: text().notNull().unique(),
  password: text(),
  avatar: text(),
  emailVerifiedAt: integer({ mode: 'timestamp' }),
  lastLoginAt: integer({ mode: 'timestamp' }),
  createdAt: integer({ mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
  updatedAt: integer({ mode: 'timestamp' }).notNull().$onUpdateFn(() => new Date()),
})

// WebAuthn credentials (passkeys). `id` is the base64url credential id issued by the authenticator.
export const userCredentials = sqliteTable('user_credentials', {
  id: text().primaryKey(),
  userId: integer().notNull().references(() => users.id, { onDelete: 'cascade' }),
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
  userId: integer().notNull().references(() => users.id, { onDelete: 'cascade' }),
  code: text().notNull().unique(),
  expiresAt: integer({ mode: 'timestamp' }).notNull(),
  usedAt: integer({ mode: 'timestamp' }),
  createdAt: integer({ mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
}, t => [
  index('password_reset_user_idx').on(t.userId),
])

export const magicLinks = sqliteTable('magic_links', {
  id: integer().primaryKey({ autoIncrement: true }),
  userId: integer().notNull().references(() => users.id, { onDelete: 'cascade' }),
  code: text().notNull().unique(),
  redirectUrl: text(),
  expiresAt: integer({ mode: 'timestamp' }).notNull(),
  usedAt: integer({ mode: 'timestamp' }),
  createdAt: integer({ mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
}, t => [
  index('magic_link_user_idx').on(t.userId),
])
