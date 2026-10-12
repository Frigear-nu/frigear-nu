import { asc, or, sql } from 'drizzle-orm'
import { db, schema } from '@nuxthub/db'
import { z } from 'zod'
import type { GroupUserDto } from '../../../../types'

const querySchema = z.object({ q: z.string().trim().min(1).max(200) })

// Searches users to add to a group, without needing the (stricter) users admin permission.
export default defineEventHandler(async (event): Promise<GroupUserDto[]> => {
  await requireGroupsManager(event)
  const { q } = await getValidatedQuery(event, querySchema.parse)
  const pattern = `%${q.replace(/[\\%_]/g, char => `\\${char}`)}%`
  return db.select({ id: schema.users.id, name: schema.users.name, email: schema.users.email }).from(schema.users)
    .where(or(sql`${schema.users.name} like ${pattern} escape '\\'`, sql`${schema.users.email} like ${pattern} escape '\\'`))
    .orderBy(asc(schema.users.name))
    .limit(10)
})
