import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core'
import type { DeliveryStatus, FormDefinition, FormStatus } from '../../../types'

export const forms = sqliteTable('forms', {
  /** `frm_` + random id. */
  id: text().primaryKey(),
  slug: text().notNull().unique(),
  name: text().notNull(),
  /** `draft | published | archived`. Only published forms are public. */
  status: text().$type<FormStatus>().notNull().default('draft'),
  definition: text({ mode: 'json' }).$type<FormDefinition>().notNull(),
  /** Bumped whenever the definition changes. */
  version: integer().notNull().default(1),
  createdAt: integer({ mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
  updatedAt: integer({ mode: 'timestamp' }).notNull().$defaultFn(() => new Date()).$onUpdateFn(() => new Date()),
})

export const formSubmissions = sqliteTable('form_submissions', {
  /** `fsb_` + random id. */
  id: text().primaryKey(),
  /** Forms are archived, never deleted, so submissions always keep their form. */
  formId: text().notNull().references(() => forms.id),
  formSlug: text().notNull(),
  formVersion: integer().notNull(),
  /** The definition as it was when the answers were given; renders old submissions correctly after edits. */
  definitionSnapshot: text({ mode: 'json' }).$type<FormDefinition>().notNull(),
  answers: text({ mode: 'json' }).$type<Record<string, unknown>>().notNull(),
  /** Signed-in submitter, if any. */
  userId: integer(),
  locale: text().notNull().default('en'),
  deliveryStatus: text().$type<DeliveryStatus>().notNull().default('none'),
  deliveryError: text(),
  createdAt: integer({ mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
}, t => [
  index('form_submission_form_idx').on(t.formId, t.createdAt),
])

export const formSubmissionFiles = sqliteTable('form_submission_files', {
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

export const formAccessTokens = sqliteTable('form_access_tokens', {
  /** `fat_` + random id. */
  id: text().primaryKey(),
  formId: text().notNull().references(() => forms.id, { onDelete: 'cascade' }),
  name: text().notNull(),
  /** SHA-256 (hex) of the token; the token itself is shown once on creation and never stored. */
  tokenHash: text().notNull().unique(),
  /** First characters of the token, for display. */
  prefix: text().notNull(),
  createdAt: integer({ mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
  lastUsedAt: integer({ mode: 'timestamp' }),
  revokedAt: integer({ mode: 'timestamp' }),
}, t => [
  index('form_access_token_form_idx').on(t.formId),
])

/** Shared password of a form with `access.auth = 'password'`. Kept out of the (versioned) definition. */
export const formAccess = sqliteTable('form_access', {
  formId: text().primaryKey().references(() => forms.id, { onDelete: 'cascade' }),
  /** Scrypt hash (nuxt-auth-utils `hashPassword`). */
  passwordHash: text().notNull(),
  updatedAt: integer({ mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
})
