import { eq } from 'drizzle-orm'
import { db, schema } from '@nuxthub/db'
import type { FormAccessTokenDto, FormAdminDto, PublicFormDto } from '../../../types'
import { newId } from '../../utils'
import type { z } from 'zod'
import type { formInput, formPatch } from './admin-schemas'

type FormRow = typeof schema.forms.$inferSelect

export const toPublicForm = (row: FormRow): PublicFormDto => {
  const { delivery: _delivery, ...definition } = row.definition
  return { id: row.id, slug: row.slug, name: row.name, version: row.version, definition }
}

export const toTokenDto = (row: typeof schema.formAccessTokens.$inferSelect): FormAccessTokenDto => ({
  id: row.id,
  name: row.name,
  prefix: row.prefix,
  createdAt: row.createdAt.toISOString(),
  lastUsedAt: row.lastUsedAt?.toISOString() ?? null,
  revokedAt: row.revokedAt?.toISOString() ?? null,
})

export const toAdminForm = (row: FormRow): FormAdminDto => ({
  id: row.id,
  slug: row.slug,
  name: row.name,
  status: row.status,
  version: row.version,
  definition: row.definition,
  createdAt: row.createdAt.toISOString(),
  updatedAt: row.updatedAt.toISOString(),
})

export async function findFormById(id: string): Promise<FormRow> {
  const [row] = await db.select().from(schema.forms).where(eq(schema.forms.id, id)).limit(1)
  if (!row) throw createError({ statusCode: 404, statusMessage: 'Form not found.' })
  return row
}

export async function findFormBySlug(slug: string): Promise<FormRow | undefined> {
  const [row] = await db.select().from(schema.forms).where(eq(schema.forms.slug, slug)).limit(1)
  return row
}

export async function findPublishedForm(slug: string): Promise<FormRow> {
  const row = await findFormBySlug(slug)
  if (!row || row.status !== 'published') throw createError({ statusCode: 404, statusMessage: 'Form not found.' })
  return row
}

export async function createForm(input: z.output<typeof formInput>): Promise<FormRow> {
  if (await findFormBySlug(input.slug)) {
    throw createError({ statusCode: 409, statusMessage: 'A form with this slug already exists.' })
  }
  const [row] = await db.insert(schema.forms).values({ id: newId('frm'), ...input }).returning()
  return row!
}

export async function patchForm(id: string, input: z.output<typeof formPatch>): Promise<FormRow> {
  const current = await findFormById(id)
  if (input.slug && input.slug !== current.slug && await findFormBySlug(input.slug)) {
    throw createError({ statusCode: 409, statusMessage: 'A form with this slug already exists.' })
  }
  // A changed definition is a new version; submissions keep the snapshot they were made against.
  const definitionChanged = input.definition !== undefined && JSON.stringify(input.definition) !== JSON.stringify(current.definition)
  const [row] = await db.update(schema.forms).set({
    ...input,
    version: definitionChanged ? current.version + 1 : current.version,
  }).where(eq(schema.forms.id, current.id)).returning()
  return row!
}
