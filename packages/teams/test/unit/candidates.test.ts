import { describe, expect, it } from 'vitest'
import { integer, sqliteTable, text, QueryBuilder } from 'drizzle-orm/sqlite-core'
import { teamsSubscriptionCandidatesQuery, teamsSubscriptionEntitles, teamsSubscriptionRowsQuery } from '../../src/runtime/server/candidates'

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

  it('reads the entitled-looking rows of many candidates in one statement', () => {
    const table = sqliteTable('subscriptions', {
      userId: integer().notNull(),
      planKey: text(),
      status: text().notNull(),
      endedAt: integer({ mode: 'timestamp' }),
      source: text(),
      currentPeriodEnd: integer({ mode: 'timestamp' }),
    })
    const { sql, params } = (teamsSubscriptionRowsQuery(new QueryBuilder(), table, [1, 2, 3], ['yearly']) as { toSQL: () => { sql: string, params: unknown[] } }).toSQL()
    expect(sql).toBe('select "userId", "planKey", "source", "currentPeriodEnd" from "subscriptions" where ("subscriptions"."userId" in (?, ?, ?) and "subscriptions"."planKey" in (?) and "subscriptions"."status" in (?, ?) and "subscriptions"."endedAt" is null)')
    expect(params).toEqual([1, 2, 3, 'yearly', 'active', 'trialing'])
  })

  it('ends a manual grant at its period end, as hasActiveSubscription does', () => {
    const now = Date.UTC(2026, 0, 1)
    expect(teamsSubscriptionEntitles({ source: 'stripe', currentPeriodEnd: new Date(now - 1) }, now)).toBe(true)
    expect(teamsSubscriptionEntitles({ source: 'manual', currentPeriodEnd: null }, now)).toBe(true)
    expect(teamsSubscriptionEntitles({ source: 'manual', currentPeriodEnd: new Date(now + 1) }, now)).toBe(true)
    expect(teamsSubscriptionEntitles({ source: 'manual', currentPeriodEnd: new Date(now) }, now)).toBe(false)
  })
})
