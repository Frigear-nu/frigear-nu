import type { H3Event } from 'h3'
import { db, schema } from '@nuxthub/db'
import { desc, eq } from 'drizzle-orm'
import { isEntitledRow } from '../../utils/plans'

/**
 * Loads the user a staff member is acting on and runs the users admin policy (`users:admin:authorize`, action
 * `view` for reads and `update` for changes) against them. Throws 400/401/403/404.
 */
export async function loadAdminMembershipTarget(event: H3Event, action: 'view' | 'update') {
  const id = Number(getRouterParam(event, 'id'))
  if (!Number.isInteger(id)) throw createError({ statusCode: 400, statusMessage: 'Invalid user id.' })

  const target = await db.query.users.findFirst({ where: (t, { eq }) => eq(t.id, id) })
  const actor = await authorizeUsersAdmin(
    event,
    action,
    target ? { target: { id: target.id, email: target.email, role: (target as { role?: string }).role }, input: {} } : {},
  )
  if (!target) throw createError({ statusCode: 404, statusMessage: 'User not found.' })
  return { actor, target }
}

/** The user's subscription rows, newest first. */
export const listUserSubscriptionRows = (userId: number) =>
  db.select().from(schema.subscriptions).where(eq(schema.subscriptions.userId, userId)).orderBy(desc(schema.subscriptions.createdAt))

export type AdminMembershipRow = Awaited<ReturnType<typeof listUserSubscriptionRows>>[number]

/** The row currently entitling the user (manual grant or Stripe subscription), preferring the latest period end. */
export function currentEntitledRow(rows: AdminMembershipRow[]) {
  return rows
    .filter(row => isEntitledRow(row))
    .sort((a, b) => (b.currentPeriodEnd?.getTime() ?? Number.POSITIVE_INFINITY) - (a.currentPeriodEnd?.getTime() ?? Number.POSITIVE_INFINITY))[0]
}
