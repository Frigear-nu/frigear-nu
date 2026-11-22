import { describe, expect, it } from 'vitest'
import { integer, sqliteTable, text, QueryBuilder } from 'drizzle-orm/sqlite-core'
import { teamsSubscriptionCandidatesQuery } from '../../src/runtime/server/candidates'

// A stand-in for the table of `@frigear-nu/subscriptions`, which the fixture does not install: only the columns the
// query reads. Role holders come from auth's `listRoleHolders` (the role provider), not from a query here.
const subscriptions = sqliteTable('subscriptions', {
  userId: integer().notNull(),
  planKey: text(),
  status: text().notNull(),
  endedAt: integer({ mode: 'timestamp' }),
})

describe('candidate queries', () => {
  const qb = new QueryBuilder()

  it('reads the users with an entitled subscription to one of the plans: active or trialing, not ended', () => {
    const { sql, params } = (teamsSubscriptionCandidatesQuery(qb, subscriptions, ['yearly'], 50) as { toSQL: () => { sql: string, params: unknown[] } }).toSQL()
    expect(sql).toBe('select distinct "userId" from "subscriptions" where ("subscriptions"."planKey" in (?) and "subscriptions"."status" in (?, ?) and "subscriptions"."endedAt" is null) limit ?')
    expect(params).toEqual(['yearly', 'active', 'trialing', 50])
  })
})
