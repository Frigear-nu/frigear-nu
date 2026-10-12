import { db, schema } from '@nuxthub/db'
import { eq } from 'drizzle-orm'

export default defineEventHandler(async (event) => {
  const id = Number(getRouterParam(event, 'id'))
  if (!Number.isInteger(id)) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid user id.' })
  }
  const target = await db.query.users.findFirst({ where: (t, { eq }) => eq(t.id, id) })
  if (!target) {
    throw createError({ statusCode: 404, statusMessage: 'User not found.' })
  }
  const actor = await authorizeUsersAdmin(event, 'delete', {
    target: { id: target.id, email: target.email, role: usersHaveRoles() ? (target as { role?: string }).role : undefined },
  })
  if (actor.id === target.id) {
    throw createError({ statusCode: 400, statusMessage: 'You cannot delete your own account here.' })
  }

  await db.delete(schema.users).where(eq(schema.users.id, id))
  return { ok: true }
})
