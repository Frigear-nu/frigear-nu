import { and, inArray, isNull } from 'drizzle-orm'
import type { Column, SQL } from 'drizzle-orm'

// The queries that find the candidates for mapped members (`teamMembers(..., { mapped: true })`). Pure: they take the
// query builder and the tables, so they are unit-tested without the modules that own the tables. Every candidate is
// checked with the resolver afterwards, so these only narrow who is checked. Role holders are not queried here: they
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
