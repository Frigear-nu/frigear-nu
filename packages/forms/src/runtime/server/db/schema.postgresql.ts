import { customType, pgTable, text, integer, jsonb, timestamp, index } from 'drizzle-orm/pg-core'
import type { DeliveryStatus, FormDefinition, FormStatus } from '../../../types'

export const forms = pgTable('forms', {
  /** `frm_` + random id. */
  id: text().primaryKey(),
  slug: text().notNull().unique(),
  name: text().notNull(),
  /** `draft | published | archived`. Only published forms are public. */
  status: text().$type<FormStatus>().notNull().default('draft'),
  definition: jsonb().$type<FormDefinition>().notNull(),
  /** Bumped whenever the definition changes. */
  version: integer().notNull().default(1),
  createdAt: timestamp({ withTimezone: true }).notNull().$defaultFn(() => new Date()),
  updatedAt: timestamp({ withTimezone: true }).notNull().$defaultFn(() => new Date()).$onUpdateFn(() => new Date()),
})

export const formSubmissions = pgTable('form_submissions', {
  /** `fsb_` + random id. */
  id: text().primaryKey(),
  /** Forms are archived, never deleted, so submissions always keep their form. */
  formId: text().notNull().references(() => forms.id),
  formSlug: text().notNull(),
  formVersion: integer().notNull(),
  /** The definition as it was when the answers were given; renders old submissions correctly after edits. */
  definitionSnapshot: jsonb().$type<FormDefinition>().notNull(),
  answers: jsonb().$type<Record<string, unknown>>().notNull(),
  /** Signed-in submitter, if any. */
  userId: integer(),
  locale: text().notNull().default('en'),
  deliveryStatus: text().$type<DeliveryStatus>().notNull().default('none'),
  deliveryError: text(),
  createdAt: timestamp({ withTimezone: true }).notNull().$defaultFn(() => new Date()),
}, t => [
  index('form_submission_form_idx').on(t.formId, t.createdAt),
])

export const formSubmissionFiles = pgTable('form_submission_files', {
  /** `fsf_` + random id. */
  id: text().primaryKey(),
  submissionId: text().notNull().references(() => formSubmissions.id, { onDelete: 'cascade' }),
  fieldKey: text().notNull(),
  /** Pathname in the blob store. */
  pathname: text().notNull(),
  filename: text().notNull(),
  contentType: text().notNull(),
  size: integer().notNull(),
}, t => [
  index('form_submission_file_submission_idx').on(t.submissionId),
])

export const formAccessTokens = pgTable('form_access_tokens', {
  /** `fat_` + random id. */
  id: text().primaryKey(),
  formId: text().notNull().references(() => forms.id, { onDelete: 'cascade' }),
  name: text().notNull(),
  /** SHA-256 (hex) of the token; the token itself is shown once on creation and never stored. */
  tokenHash: text().notNull().unique(),
  /** First characters of the token, for display. */
  prefix: text().notNull(),
  createdAt: timestamp({ withTimezone: true }).notNull().$defaultFn(() => new Date()),
  lastUsedAt: timestamp({ withTimezone: true }),
  revokedAt: timestamp({ withTimezone: true }),
}, t => [
  index('form_access_token_form_idx').on(t.formId),
])

/** Shared password of a form with `access.auth = 'password'`. Kept out of the (versioned) definition. */
export const formAccess = pgTable('form_access', {
  formId: text().primaryKey().references(() => forms.id, { onDelete: 'cascade' }),
  /** Scrypt hash (nuxt-auth-utils `hashPassword`). */
  passwordHash: text().notNull(),
  updatedAt: timestamp({ withTimezone: true }).notNull().$defaultFn(() => new Date()),
})

/**
 * Per-form secrets, encrypted at rest. Keys are namespaced strings (`captcha.turnstile.secretKey`, ...) from an
 * allowlist in `utils/secrets.ts`; future integrations (webhook signing secrets, ...) add their keys there.
 * Kept out of the (versioned) definition, submission snapshots, deliveries and exports.
 */
export const formSecrets = pgTable('form_secrets', {
  formId: text().primaryKey().references(() => forms.id, { onDelete: 'cascade' }),
  // Inline on purpose: the module kit copies this property (and only the imports above) into a generated schema
  // template, so it cannot call a local helper. `utils/crypto.ts` registers the cipher on `globalThis`.
  secrets: customType<{ data: Record<string, string>, driverData: string }>({
    dataType: () => 'text',
    toDriver: value => globalThis.__frigearFormsCrypto!.encrypt(value),
    fromDriver: value => globalThis.__frigearFormsCrypto!.decrypt(value) as Record<string, string>,
  })('secrets').notNull(),
  updatedAt: timestamp({ withTimezone: true }).notNull().$defaultFn(() => new Date()),
})
