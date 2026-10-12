import { and, eq } from 'drizzle-orm'
import { db, schema } from '@nuxthub/db'

export default defineEventHandler(async (event) => {
  await requireGroupsManager(event)
  const group = await findGroupById(getRouterParam(event, 'id')!)
  const userId = Number(getRouterParam(event, 'userId'))
  if (!Number.isInteger(userId)) throw createError({ statusCode: 400, statusMessage: 'Invalid user id.' })
  await db.delete(schema.userGroupMembers).where(and(eq(schema.userGroupMembers.groupId, group.id), eq(schema.userGroupMembers.userId, userId)))
  setResponseStatus(event, 204)
  return null
})
