import { db, schema } from '@nuxthub/db'
import { count, eq } from 'drizzle-orm'

export default defineEventHandler(async (event) => {
  // Also open to API tokens / OAuth access tokens with `users:read`; they never get `can.update` / `can.delete`.
  const { actor, target } = await loadUsersAdminTarget(event, 'view', { scopes: [USERS_READ_SCOPE] })
  const withRole = usersHaveRoles()
  const targetInfo = usersAdminTargetInfo(target)

  const passkeys = schema.userCredentials
    ? (await db.select({ total: count() }).from(schema.userCredentials).where(eq(schema.userCredentials.userId, target.id)))[0]?.total ?? 0
    : 0
  const subscription = (await latestSubscriptions([target.id])).get(target.id) ?? null

  const [canUpdate, canDelete] = await Promise.all([
    isUsersAdminAllowed(event, 'update', { target: targetInfo, input: {} }),
    isUsersAdminAllowed(event, 'delete', { target: targetInfo }),
  ])

  return {
    ...toAdminUserDto(target),
    hasPassword: !!target.password,
    passkeys,
    subscription,
    hasRoles: withRole,
    roles: withRole ? await assignableRoles(event, actor.id as number) : [],
    can: { update: canUpdate.allowed, delete: canDelete.allowed && target.id !== actor.id },
  }
})
