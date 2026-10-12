import { asc } from 'drizzle-orm'
import { db, schema } from '@nuxthub/db'
import type { GroupOptionDto } from '../../../../types'

// The groups documents can be shared with, without needing the groups admin permission.
export default defineEventHandler(async (event): Promise<GroupOptionDto[]> => {
  await requireDocumentsManager(event)
  return db.select({ id: schema.userGroups.id, slug: schema.userGroups.slug, name: schema.userGroups.name })
    .from(schema.userGroups).orderBy(asc(schema.userGroups.slug))
})
