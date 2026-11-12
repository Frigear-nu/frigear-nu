import { db, schema } from '@nuxthub/db'
import { and, asc, count, inArray, isNotNull, isNull, or, sql } from 'drizzle-orm'
import type { SQL } from 'drizzle-orm'
import { z } from 'zod'
import { escapeLike, likeEscaped as like, orderByQuery, pageQuery, pageRange, paginate } from '@frigear-nu/module-kit/server'

const querySchema = pageQuery({
  sort: ['id', 'name', 'email', 'role', 'createdAt', 'lastLoginAt'],
  defaultSort: 'createdAt',
  filters: {
    role: z.string().trim().min(1).max(60).optional(),
    verified: z.enum(['true', 'false']).optional(),
  },
})

export default defineEventHandler(async (event) => {
  // `users:list`, also for API tokens / OAuth access tokens that carry it.
  await authorizeUsersAdmin(event, 'list')

  const query = await getValidatedQuery(event, querySchema.parse)
  // Stored role assignments (`@frigear-nu/authorization`): the role filter and sort only exist with them. Default,
  // `auto` and hook roles are not stored, so they are not filterable.
  const userRoles = usersRoleAssignments()

  const conditions: (SQL | undefined)[] = []
  if (query.q) {
    const pattern = `%${escapeLike(query.q)}%`
    conditions.push(or(like(schema.users.name, pattern), like(schema.users.email, pattern)))
  }
  if (query.role && userRoles) {
    conditions.push(sql`exists (select 1 from ${userRoles} where ${userRoles.userId} = ${schema.users.id} and ${userRoles.role} = ${query.role})`)
  }
  if (query.verified) {
    conditions.push(query.verified === 'true' ? isNotNull(schema.users.emailVerifiedAt) : isNull(schema.users.emailVerifiedAt))
  }
  const where = conditions.length ? and(...conditions) : undefined

  // A user may hold several roles: sorting by role sorts by the first of their stored roles (alphabetically).
  const firstRole = userRoles
    ? sql<string | null>`(select min(${userRoles.role}) from ${userRoles} where ${userRoles.userId} = ${schema.users.id})`
    : undefined

  // `id` as a tiebreaker keeps pages stable when many rows share the sort value.
  const orderBy = orderByQuery({
    id: schema.users.id,
    name: schema.users.name,
    email: schema.users.email,
    role: firstRole,
    createdAt: schema.users.createdAt,
    lastLoginAt: schema.users.lastLoginAt,
  }, query, { tiebreaker: schema.users.id })

  const { limit, offset } = pageRange(query)
  const [rows, [totals]] = await Promise.all([
    db.select().from(schema.users).where(where).orderBy(...orderBy).limit(limit).offset(offset),
    db.select({ total: count() }).from(schema.users).where(where),
  ])

  const subscriptions = await latestSubscriptions(rows.map(user => user.id))
  const rolesByUser = new Map<number, string[]>()
  if (userRoles && rows.length) {
    const assigned = await db.select({ userId: userRoles.userId, role: userRoles.role })
      .from(userRoles as never)
      .where(inArray(userRoles.userId, rows.map(user => user.id)))
      .orderBy(asc(userRoles.role)) as { userId: number, role: string }[]
    for (const { userId, role } of assigned) rolesByUser.set(userId, [...rolesByUser.get(userId) ?? [], role])
  }

  return {
    ...paginate({
      total: totals?.total ?? 0,
      query,
      items: rows.map(user => ({
        ...toAdminUserDto(user),
        subscription: subscriptions.get(user.id) ?? null,
        ...(userRoles ? { roles: rolesByUser.get(user.id) ?? [] } : {}),
      })),
    }),
    hasRoles: !!userRoles,
    hasSubscriptions: !!(schema as unknown as Record<string, unknown>).subscriptions,
    roles: userRoles ? usersStoredRoleOptions() : [],
  }
})
