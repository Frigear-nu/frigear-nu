import { asc, count } from 'drizzle-orm'
import { db, schema } from '@nuxthub/db'
import type { GroupDto } from '../../../../types'

export default defineEventHandler(async (event): Promise<GroupDto[]> => {
  await requireGroupsManager(event)
  const [rows, counts] = await Promise.all([
    db.select().from(schema.userGroups).orderBy(asc(schema.userGroups.slug)),
    db.select({ groupId: schema.userGroupMembers.groupId, total: count() }).from(schema.userGroupMembers)
      .groupBy(schema.userGroupMembers.groupId),
  ])
  const totals = new Map(counts.map(row => [row.groupId, row.total]))
  return rows.map(row => toGroupDto(row, totals.get(row.id) ?? 0))
})
