import { count, desc } from 'drizzle-orm'
import { db, schema } from '@nuxthub/db'

export default defineScopedMcpTool({
  description: 'List all forms including drafts, with submission counts (staff).',
  permission: 'forms:manage',
  annotations: { readOnlyHint: true },
  handler: async () => {
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
      submissionCount: totals.get(row.id) ?? 0,
    }))
  },
})
