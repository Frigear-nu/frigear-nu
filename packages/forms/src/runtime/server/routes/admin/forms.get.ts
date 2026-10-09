import { count, desc } from 'drizzle-orm'
import { db, schema } from '@nuxthub/db'
import type { FormSummaryDto } from '../../../../types'

export default defineEventHandler(async (event): Promise<FormSummaryDto[]> => {
  await requireFormsManager(event)
  const rows = await db.select().from(schema.forms).orderBy(desc(schema.forms.updatedAt))
  const counts = await db.select({ formId: schema.formSubmissions.formId, total: count() })
    .from(schema.formSubmissions).groupBy(schema.formSubmissions.formId)
  const totals = new Map(counts.map(row => [row.formId, row.total]))
  return rows.map(row => ({
    id: row.id,
    slug: row.slug,
    name: row.name,
    status: row.status,
    version: row.version,
    storage: row.definition.storage,
    mode: row.definition.mode,
    submissionCount: totals.get(row.id) ?? 0,
    updatedAt: row.updatedAt.toISOString(),
  }))
})
