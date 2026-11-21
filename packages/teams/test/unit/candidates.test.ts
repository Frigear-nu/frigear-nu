import { describe, expect, it } from 'vitest'
import { integer, sqliteTable, text, QueryBuilder } from 'drizzle-orm/sqlite-core'
import { teamsAuthorizationCandidatesQuery, teamsRolesGranting, teamsSubscriptionCandidatesQuery } from '../../src/runtime/server/candidates'

// Stand-ins for the tables of `@frigear-nu/authorization` and `@frigear-nu/subscriptions`, which the fixture does not
// install: only the columns the queries read.
const authorizationUserRoles = sqliteTable('authorization_user_roles', {
  userId: integer('user_id').notNull(),
  role: text('role').notNull(),
})
const subscriptions = sqliteTable('subscriptions', {
  userId: integer().notNull(),
  planKey: text(),
  status: text().notNull(),
  endedAt: integer({ mode: 'timestamp' }),
})

describe('teamsRolesGranting', () => {
  // The website chain, by `inherit`.
  const roles = {
    admin: { inherit: ['manager'] },
    manager: { inherit: ['coordinator'] },
    coordinator: { inherit: ['barmanager'] },
    barmanager: { inherit: ['crew'] },
    crew: { inherit: ['member'] },
    member: { inherit: ['user'] },
    user: { inherit: [] },
    other: { inherit: ['user'] },
  }

  it('adds every role that inherits a referenced one, directly or not', () => {
    expect(teamsRolesGranting(roles, ['barmanager'])).toEqual(['admin', 'barmanager', 'coordinator', 'manager'])
    expect(teamsRolesGranting(roles, ['member'])).toEqual(['admin', 'barmanager', 'coordinator', 'crew', 'manager', 'member'])
    expect(teamsRolesGranting(roles, ['nobody'])).toEqual(['nobody'])
  })
})

describe('candidate queries', () => {
  const qb = new QueryBuilder()

  it('reads the users assigned one of the roles', () => {
    const { sql, params } = (teamsAuthorizationCandidatesQuery(qb, authorizationUserRoles, ['barmanager', 'admin'], 1000) as { toSQL: () => { sql: string, params: unknown[] } }).toSQL()
    expect(sql).toBe('select distinct "user_id" from "authorization_user_roles" where "authorization_user_roles"."role" in (?, ?) limit ?')
    expect(params).toEqual(['barmanager', 'admin', 1000])
  })

  it('reads the users with an entitled subscription to one of the plans: active or trialing, not ended', () => {
    const { sql, params } = (teamsSubscriptionCandidatesQuery(qb, subscriptions, ['yearly'], 50) as { toSQL: () => { sql: string, params: unknown[] } }).toSQL()
    expect(sql).toBe('select distinct "userId" from "subscriptions" where ("subscriptions"."planKey" in (?) and "subscriptions"."status" in (?, ?) and "subscriptions"."endedAt" is null) limit ?')
    expect(params).toEqual(['yearly', 'active', 'trialing', 50])
  })
})
