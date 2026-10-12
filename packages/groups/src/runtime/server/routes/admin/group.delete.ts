import { eq } from 'drizzle-orm'
import { db, schema } from '@nuxthub/db'

export default defineEventHandler(async (event) => {
  await requireGroupsManager(event)
  const group = await findGroupById(getRouterParam(event, 'id')!)
  await db.delete(schema.userGroupMembers).where(eq(schema.userGroupMembers.groupId, group.id))
  await db.delete(schema.userGroups).where(eq(schema.userGroups.id, group.id))
  await useNitroApp().hooks.callHook('groups:deleted', { groupId: group.id })
  setResponseStatus(event, 204)
  return null
})
