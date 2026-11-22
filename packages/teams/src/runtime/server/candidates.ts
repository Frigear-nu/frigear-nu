import { and, inArray, isNull } from 'drizzle-orm'
import type { Column, SQL } from 'drizzle-orm'

// The queries that find the candidates for mapped members (`teamMembers(..., { mapped: true })`). Pure: they take the
// query builder and the tables, so they are unit-tested without the modules that own the tables. Every candidate is
// checked afterwards (in bulk, `teamMembers`), so these only narrow who is checked. Role holders are not queried here: they
// come from auth's `listRoleHolders` (the role provider, `@frigear-nu/authorization`).

/** The statuses `@frigear-nu/subscriptions` counts as entitled by default (`DEFAULT_ENTITLED_STATUSES`). */
export const TEAMS_ENTITLED_SUBSCRIPTION_STATUSES = ['active', 'trialing'] as const

type SelectDistinct = {
  selectDistinct: (fields: Record<string, Column>) => {
    from: (table: never) => { where: (condition: SQL | undefined) => { limit: (count: number) => unknown } }
  }
}

/** Users with an entitled subscription row (active or trialing, not ended) to one of `plans`. */
export function teamsSubscriptionCandidatesQuery<Q>(qb: Q, table: { userId: Column, planKey: Column, status: Column, endedAt: Column }, plans: readonly string[], limit: number) {
  return (qb as unknown as SelectDistinct).selectDistinct({ userId: table.userId }).from(table as never)
    .where(and(inArray(table.planKey, [...plans]), inArray(table.status, [...TEAMS_ENTITLED_SUBSCRIPTION_STATUSES]), isNull(table.endedAt)))
    .limit(limit)
}

type SelectRows = {
  select: (fields: Record<string, Column>) => {
    from: (table: never) => { where: (condition: SQL | undefined) => unknown }
  }
}

type SubscriptionColumns = { userId: Column, planKey: Column, status: Column, endedAt: Column, source?: Column, currentPeriodEnd?: Column }

/**
 * The subscription rows of `userIds` on one of `plans` that look entitled (active or trialing, not ended), to check
 * many mapped candidates in one statement. A manual grant past its end date is filtered afterwards
 * ({@link teamsSubscriptionEntitles}). The statement binds the user ids, the plans and the two statuses: pass the ids
 * in chunks.
 */
export function teamsSubscriptionRowsQuery<Q>(qb: Q, table: SubscriptionColumns, userIds: readonly number[], plans: readonly string[]) {
  const fields: Record<string, Column> = { userId: table.userId, planKey: table.planKey }
  if (table.source) fields.source = table.source
  if (table.currentPeriodEnd) fields.currentPeriodEnd = table.currentPeriodEnd
  return (qb as unknown as SelectRows).select(fields).from(table as never)
    .where(and(inArray(table.userId, [...userIds]), inArray(table.planKey, [...plans]), inArray(table.status, [...TEAMS_ENTITLED_SUBSCRIPTION_STATUSES]), isNull(table.endedAt)))
}

/**
 * Whether a row of {@link teamsSubscriptionRowsQuery} entitles its user, as `hasActiveSubscription` decides: a manual
 * grant (no Stripe lifecycle to end it) stops at its period end.
 */
export function teamsSubscriptionEntitles(row: { source?: unknown, currentPeriodEnd?: unknown }, now = Date.now()): boolean {
  if (row.source !== 'manual' || row.currentPeriodEnd === null || row.currentPeriodEnd === undefined) return true
  const end = row.currentPeriodEnd instanceof Date ? row.currentPeriodEnd.getTime() : Number(row.currentPeriodEnd)
  return end > now
}
