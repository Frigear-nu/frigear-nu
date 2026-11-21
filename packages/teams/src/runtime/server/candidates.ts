import { and, inArray, isNull } from 'drizzle-orm'
import type { Column, SQL } from 'drizzle-orm'

// The queries that find the candidates for mapped members (`teamMembers(..., { mapped: true })`). Pure: they take the
// query builder and the tables, so they are unit-tested without the modules that own the tables. Every candidate is
// checked with the resolver afterwards, so these only narrow who is checked.

/** The statuses `@frigear-nu/subscriptions` counts as entitled by default (`DEFAULT_ENTITLED_STATUSES`). */
export const TEAMS_ENTITLED_SUBSCRIPTION_STATUSES = ['active', 'trialing'] as const

/**
 * The roles that grant any of `referenced`: the roles themselves, and every role that inherits one of them, directly or
 * through another role (when `supervisor` inherits `member`, a rule on `member` also needs the `supervisor` holders).
 * `roles` is auth's compiled role table (`#auth/roles`).
 */
export function teamsRolesGranting(roles: Readonly<Record<string, { inherit?: readonly string[] }>>, referenced: readonly string[]): string[] {
  const result = new Set(referenced)
  let grew = true
  while (grew) {
    grew = false
    for (const [name, role] of Object.entries(roles)) {
      if (result.has(name)) continue
      if ((role.inherit ?? []).some(parent => result.has(parent))) {
        result.add(name)
        grew = true
      }
    }
  }
  return [...result].sort()
}

type SelectDistinct = {
  selectDistinct: (fields: Record<string, Column>) => {
    from: (table: never) => { where: (condition: SQL | undefined) => { limit: (count: number) => unknown } }
  }
}

/** Users with one of `roles` assigned in `authorization_user_roles`. */
export function teamsAuthorizationCandidatesQuery<Q>(qb: Q, table: { userId: Column, role: Column }, roles: readonly string[], limit: number) {
  return (qb as unknown as SelectDistinct).selectDistinct({ userId: table.userId }).from(table as never)
    .where(inArray(table.role, [...roles])).limit(limit)
}

/** Users with an entitled subscription row (active or trialing, not ended) to one of `plans`. */
export function teamsSubscriptionCandidatesQuery<Q>(qb: Q, table: { userId: Column, planKey: Column, status: Column, endedAt: Column }, plans: readonly string[], limit: number) {
  return (qb as unknown as SelectDistinct).selectDistinct({ userId: table.userId }).from(table as never)
    .where(and(inArray(table.planKey, [...plans]), inArray(table.status, [...TEAMS_ENTITLED_SUBSCRIPTION_STATUSES]), isNull(table.endedAt)))
    .limit(limit)
}
