import { db } from '@nuxthub/db'

export default defineEventHandler(async (event) => {
  const id = Number(getRouterParam(event, 'id'))
  if (!Number.isInteger(id)) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid user id.' })
  }
  const target = await db.query.users.findFirst({ where: (t, { eq }) => eq(t.id, id) })
  if (!target) {
    throw createError({ statusCode: 404, statusMessage: 'User not found.' })
  }
  await authorizeUsersAdmin(event, 'update', {
    target: { id: target.id, email: target.email, role: usersHaveRoles() ? (target as { role?: string }).role : undefined },
  })
  const sent = await sendVerificationLink(event, target)
  if (!sent) {
    throw createError({ statusCode: 501, statusMessage: 'Sign-in links are not enabled.' })
  }
  return { ok: true }
})
