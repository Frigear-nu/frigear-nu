import type { H3Event } from 'h3'
import { db, schema } from '@nuxthub/db'
import { desc, eq } from 'drizzle-orm'
import { forbidden } from '@frigear-nu/module-kit/server'
import type { AuthUser } from '@frigear-nu/auth/utils'
import { table } from '#auth/roles'
import { isEntitledRow } from '../../utils/plans'
import { subscriptionRequirementPlans } from '../requirements/subscription'

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

/**
 * The roles a subscription on `planKey` satisfies the `subscription` requirement of (`requirements.subscription` is
 * `'*'`, the plan, or a list with it), from the compiled role table. A subscription without a plan key only satisfies
 * `'*'`.
 */
export function subscriptionsRolesForPlan(planKey: string | null | undefined): string[] {
  return Object.values(table.roles).filter((role) => {
    if (!Object.hasOwn(role.requirements, 'subscription')) return false
    const plans = subscriptionRequirementPlans(role.requirements.subscription)
    if (!plans) return false
    return plans.length === 0 || (!!planKey && plans.includes(planKey))
  }).map(role => role.name)
}

/**
 * Guards a staff action that confers a subscription on `targetId` (a free membership, a payment link): staff may not
 * confer one on themselves, and must hold every permission of every role the subscription would satisfy, so a
 * membership cannot hand out more than the staff member holds. Sensitive permissions count by name; the actor holds a
 * permission through their roles or `authorization:before`, as their own session would. Throws 403 `forbidden`.
 */
export async function assertSubscriptionsGrantAllowed(event: H3Event, actor: AuthUser, targetId: number, planKey: string | null | undefined): Promise<void> {
  if (String(actor.id) === String(targetId)) {
    throw forbidden('You cannot give yourself a membership.')
  }
  const roles = subscriptionsRolesForPlan(planKey)
  const permissions = [...new Set(roles.flatMap(role => table.roles[role]!.permissions))].sort()
  if (!permissions.length) return
  const held = new Set(await getUserPermissions(event, actor))
  const missing: string[] = []
  for (const permission of permissions) {
    if (held.has(permission)) continue
    if (!(await subjectAllowed(event, actor, permission))) missing.push(permission)
  }
  if (missing.length) {
    throw forbidden('This membership grants permissions you do not have.', { missing, roles })
  }
}
