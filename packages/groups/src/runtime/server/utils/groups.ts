import { and, count, eq, inArray } from 'drizzle-orm'
import { db, schema } from '@nuxthub/db'
import type { GroupDto } from '../../../types'

type GroupRow = typeof schema.userGroups.$inferSelect

export const toGroupDto = (row: GroupRow, memberCount: number): GroupDto => ({
  id: row.id,
  slug: row.slug,
  name: row.name,
  description: row.description ?? null,
  icon: row.icon ?? null,
  memberCount,
  createdAt: row.createdAt.toISOString(),
})

export async function findGroupById(id: string): Promise<GroupRow> {
  const [row] = await db.select().from(schema.userGroups).where(eq(schema.userGroups.id, id)).limit(1)
  if (!row) throw createError({ statusCode: 404, statusMessage: 'Group not found.' })
  return row
}

export async function countMembers(groupId: string): Promise<number> {
  const [row] = await db.select({ total: count() }).from(schema.userGroupMembers).where(eq(schema.userGroupMembers.groupId, groupId))
  return row?.total ?? 0
}

/** Ids of every group the user belongs to. */
export async function getUserGroupIds(userId: number): Promise<string[]> {
  const rows = await db.select({ groupId: schema.userGroupMembers.groupId }).from(schema.userGroupMembers)
    .where(eq(schema.userGroupMembers.userId, userId))
  return rows.map(row => row.groupId)
}

/** True when the user belongs to at least one of `groupIds`. */
export async function isInGroups(userId: number, groupIds: string[]): Promise<boolean> {
  if (!groupIds.length) return false
  const [row] = await db.select({ groupId: schema.userGroupMembers.groupId }).from(schema.userGroupMembers)
    .where(and(eq(schema.userGroupMembers.userId, userId), inArray(schema.userGroupMembers.groupId, groupIds)))
    .limit(1)
  return !!row
}
