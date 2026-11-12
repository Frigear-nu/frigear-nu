import { db, schema } from '@nuxthub/db'
import { desc } from 'drizzle-orm'

export default defineScopedMcpTool({
  description: 'List all events including drafts and archived ones (staff).',
  permission: 'events:manage',
  annotations: { readOnlyHint: true },
  handler: () => db.select().from(schema.events).orderBy(desc(schema.events.startsAt)),
})
