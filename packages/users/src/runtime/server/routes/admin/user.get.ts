import { db, schema } from '@nuxthub/db'
import { count, eq } from 'drizzle-orm'

export default defineEventHandler(async (event) => {
  // `users:read`, also for API tokens / OAuth access tokens that carry it; `can` is what this credential may do (deleting
  // and `manage` are session only).
  const { actor, target } = await loadUsersAdminTarget(event, 'view')

  const passkeys = schema.userCredentials
    ? (await db.select({ total: count() }).from(schema.userCredentials).where(eq(schema.userCredentials.userId, target.id)))[0]?.total ?? 0
    : 0
  const subscription = (await latestSubscriptions([target.id])).get(target.id) ?? null

  const [canUpdate, canDelete, canManage] = await Promise.all([
    canUsersAdminTarget(event, 'update', target),
    canUsersAdminTarget(event, 'delete', target),
    canUsersAdminTarget(event, 'manage', target),
  ])

  return {
    ...toAdminUserDto(target),
    hasPassword: !!target.password,
    passkeys,
    subscription,
    can: { update: canUpdate, delete: canDelete && target.id !== actor.id, manage: canUpdate && canManage },
  }
})
