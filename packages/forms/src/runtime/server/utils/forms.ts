import { eq } from 'drizzle-orm'
import { db, schema } from '@nuxthub/db'
import { conflict, isoDate, notFound } from '@frigear-nu/module-kit/server'
import type { FormAccessTokenDto, FormAdminDto, FormSummaryDto, PublicFormDto, SubmissionDto, SubmissionFileDto, SubmissionSummaryDto } from '../../../types'
import { newId } from '../../utils'
import { renderAnswers } from './render'
import type { z } from 'zod'
import type { formInput, formPatch } from './admin-schemas'

type FormRow = typeof schema.forms.$inferSelect

export const toPublicForm = (row: FormRow): PublicFormDto => {
  const { delivery: _delivery, ...definition } = row.definition
  return { id: row.id, slug: row.slug, name: row.name, version: row.version, definition }
}

export const toFormTokenDto = (row: typeof schema.formAccessTokens.$inferSelect): FormAccessTokenDto => ({
  id: row.id,
  name: row.name,
  prefix: row.prefix,
  createdAt: isoDate(row.createdAt),
  lastUsedAt: isoDate(row.lastUsedAt),
  revokedAt: isoDate(row.revokedAt),
})

export const toAdminForm = (row: FormRow): FormAdminDto => ({
  id: row.id,
  slug: row.slug,
  name: row.name,
  status: row.status,
  version: row.version,
  definition: row.definition,
  createdAt: isoDate(row.createdAt),
  updatedAt: isoDate(row.updatedAt),
})

/** A row of the admin form list. */
export const toFormSummaryDto = (row: FormRow, submissionCount: number): FormSummaryDto => ({
  id: row.id,
  slug: row.slug,
  name: row.name,
  status: row.status,
  version: row.version,
  storage: row.definition.storage,
  mode: row.definition.mode,
  submissionCount,
  updatedAt: isoDate(row.updatedAt),
})

type SubmissionRow = typeof schema.formSubmissions.$inferSelect
type SubmissionFileRow = typeof schema.formSubmissionFiles.$inferSelect

/** A row of a form's submission list: the first few answers as a preview. */
export const toSubmissionSummaryDto = (row: SubmissionRow): SubmissionSummaryDto => ({
  id: row.id,
  createdAt: isoDate(row.createdAt),
  locale: row.locale,
  userId: row.userId,
  deliveryStatus: row.deliveryStatus,
  preview: renderAnswers(row.definitionSnapshot, row.answers, row.locale)
    .filter(answer => answer.value)
    .slice(0, 3)
    .map(({ label, value }) => ({ label, value: value.slice(0, 120) })),
})

/** File metadata of a submission; the blob pathname stays on the server. */
export const toSubmissionFileDto = (row: SubmissionFileRow): SubmissionFileDto => ({
  id: row.id,
  fieldKey: row.fieldKey,
  filename: row.filename,
  contentType: row.contentType,
  size: row.size,
})

export const toSubmissionDto = (row: SubmissionRow, files: SubmissionFileRow[]): SubmissionDto => ({
  id: row.id,
  formId: row.formId,
  formSlug: row.formSlug,
  formVersion: row.formVersion,
  definition: row.definitionSnapshot,
  answers: row.answers,
  files: files.map(toSubmissionFileDto),
  locale: row.locale,
  userId: row.userId,
  deliveryStatus: row.deliveryStatus,
  deliveryError: row.deliveryError,
  createdAt: isoDate(row.createdAt),
})

export async function findSubmissionById(id: string): Promise<SubmissionRow> {
  const [row] = await db.select().from(schema.formSubmissions).where(eq(schema.formSubmissions.id, id)).limit(1)
  if (!row) throw notFound('Submission not found.')
  return row
}

export async function findFormById(id: string): Promise<FormRow> {
  const [row] = await db.select().from(schema.forms).where(eq(schema.forms.id, id)).limit(1)
  if (!row) throw notFound('Form not found.')
  return row
}

export async function findFormBySlug(slug: string): Promise<FormRow | undefined> {
  const [row] = await db.select().from(schema.forms).where(eq(schema.forms.slug, slug)).limit(1)
  return row
}

export async function findPublishedForm(slug: string): Promise<FormRow> {
  const row = await findFormBySlug(slug)
  if (!row || row.status !== 'published') throw notFound('Form not found.')
  return row
}

export async function createForm(input: z.output<typeof formInput>): Promise<FormRow> {
  if (await findFormBySlug(input.slug)) {
    throw conflict('A form with this slug already exists.', { field: 'slug' })
  }
  const [row] = await db.insert(schema.forms).values({ id: newId('frm'), ...input }).returning()
  return row!
}

export async function patchForm(id: string, input: z.output<typeof formPatch>): Promise<FormRow> {
  const current = await findFormById(id)
  if (input.slug && input.slug !== current.slug && await findFormBySlug(input.slug)) {
    throw conflict('A form with this slug already exists.', { field: 'slug' })
  }
  // A changed definition is a new version; submissions keep the snapshot they were made against.
  const definitionChanged = input.definition !== undefined && JSON.stringify(input.definition) !== JSON.stringify(current.definition)
  const [row] = await db.update(schema.forms).set({
    ...input,
    version: definitionChanged ? current.version + 1 : current.version,
  }).where(eq(schema.forms.id, current.id)).returning()
  return row!
}
