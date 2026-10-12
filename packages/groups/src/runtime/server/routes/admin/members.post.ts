import { eq } from 'drizzle-orm'
import { db, schema } from '@nuxthub/db'
import { memberInput } from '../../utils/admin-schemas'

export default defineEventHandler(async (event) => {
  await requireGroupsManager(event)
  const group = await findGroupById(getRouterParam(event, 'id')!)
  const { userId } = await readValidatedBody(event, memberInput.parse)

  const [user] = await db.select({ id: schema.users.id }).from(schema.users).where(eq(schema.users.id, userId)).limit(1)
  if (!user) throw createError({ statusCode: 404, statusMessage: 'User not found.' })

  await db.insert(schema.userGroupMembers).values({ groupId: group.id, userId }).onConflictDoNothing()
  setResponseStatus(event, 201)
  return { groupId: group.id, userId }
})
