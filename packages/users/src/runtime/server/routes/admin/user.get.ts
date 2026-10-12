import { db, schema } from '@nuxthub/db'
import { count, eq } from 'drizzle-orm'

export default defineEventHandler(async (event) => {
  const id = Number(getRouterParam(event, 'id'))
  if (!Number.isInteger(id)) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid user id.' })
  }
  const actor = await authorizeUsersAdmin(event, 'view')

  const target = await db.query.users.findFirst({ where: (t, { eq }) => eq(t.id, id) })
  if (!target) {
    throw createError({ statusCode: 404, statusMessage: 'User not found.' })
  }
  const withRole = usersHaveRoles()
  const role = withRole ? (target as { role?: string }).role : undefined
  const targetInfo = { id: target.id, email: target.email, role }

  const passkeys = schema.userCredentials
    ? (await db.select({ total: count() }).from(schema.userCredentials).where(eq(schema.userCredentials.userId, id)))[0]?.total ?? 0
    : 0
  const subscription = (await latestSubscriptions([id])).get(id) ?? null

  const [canUpdate, canDelete] = await Promise.all([
    isUsersAdminAllowed(event, 'update', { target: targetInfo, input: {} }),
    isUsersAdminAllowed(event, 'delete', { target: targetInfo }),
  ])

  const { password, ...safe } = target
  return {
    ...safe,
    hasPassword: !!password,
    passkeys,
    subscription,
    hasRoles: withRole,
    roles: withRole ? await assignableRoles(event, actor.id as number) : [],
    can: { update: canUpdate.allowed, delete: canDelete.allowed && target.id !== actor.id },
  }
})
