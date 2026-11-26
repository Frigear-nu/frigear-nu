import { db, schema } from '@nuxthub/db'
import { asc } from 'drizzle-orm'
import { shortLinksAccess } from '../../../access'

// The owner modules that have links, for the list's owner filter (a small, bounded list).
export default defineEventHandler(async (event): Promise<string[]> => {
  await authorize(event, shortLinksAccess.permissions.manage)
  const rows = await db.selectDistinct({ module: schema.shortLinks.ownerModule })
    .from(schema.shortLinks)
    .orderBy(asc(schema.shortLinks.ownerModule))
    .limit(100)
  return rows.map(row => row.module)
})
