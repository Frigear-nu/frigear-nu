import { desc, eq } from 'drizzle-orm'
import { db, schema } from '@nuxthub/db'

export default defineScopedMcpTool({
  description: 'List the published forms you can fill in.',
  scopes: ['forms:submit'],
  annotations: { readOnlyHint: true },
  handler: async () => {
    const rows = await db.select().from(schema.forms).where(eq(schema.forms.status, 'published')).orderBy(desc(schema.forms.updatedAt))
    return rows.map(row => ({ slug: row.slug, name: row.name, mode: row.definition.mode }))
  },
})
