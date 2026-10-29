import { db, schema } from '@nuxthub/db'
import { eq } from 'drizzle-orm'
import { badRequest, noContent } from '@frigear-nu/module-kit/server'

export default defineEventHandler(async (event) => {
  const { actor, target } = await loadUsersAdminTarget(event, 'delete')
  if (actor.id === target.id) {
    throw badRequest('You cannot delete your own account here.')
  }

  await deleteUserAuthData(target.id)
  await db.delete(schema.users).where(eq(schema.users.id, target.id))
  return noContent(event)
})
