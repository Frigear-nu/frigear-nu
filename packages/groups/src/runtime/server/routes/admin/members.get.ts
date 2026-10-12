import { asc, eq } from 'drizzle-orm'
import { db, schema } from '@nuxthub/db'
import type { GroupMemberDto } from '../../../../types'

export default defineEventHandler(async (event): Promise<GroupMemberDto[]> => {
  await requireGroupsManager(event)
  const group = await findGroupById(getRouterParam(event, 'id')!)
  const rows = await db.select({
    userId: schema.userGroupMembers.userId,
    addedAt: schema.userGroupMembers.createdAt,
    name: schema.users.name,
    email: schema.users.email,
  }).from(schema.userGroupMembers)
    .innerJoin(schema.users, eq(schema.users.id, schema.userGroupMembers.userId))
    .where(eq(schema.userGroupMembers.groupId, group.id))
    .orderBy(asc(schema.users.name))
  return rows.map(row => ({ userId: row.userId, name: row.name, email: row.email, addedAt: row.addedAt.toISOString() }))
})
