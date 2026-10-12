import { eq } from 'drizzle-orm'
import { db, schema } from '@nuxthub/db'
import type { FormAccessTokenDto, FormAdminDto, PublicFormDto } from '../../../types'

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
