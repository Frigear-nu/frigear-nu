import { db, schema } from '@nuxthub/db'
import { and, count, eq, isNotNull, isNull, or } from 'drizzle-orm'
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
  const actor = await authorizeUsersAdmin(event, 'view')

  const query = await getValidatedQuery(event, querySchema.parse)
  const withRole = usersHaveRoles()
  const columns = schema.users as typeof schema.users & { role?: typeof schema.users.name }

  const conditions: (SQL | undefined)[] = []
  if (query.q) {
    const pattern = `%${escapeLike(query.q)}%`
    const matches = [like(schema.users.name, pattern), like(schema.users.email, pattern)]
    if (withRole && columns.role) matches.push(like(columns.role, pattern))
    conditions.push(or(...matches))
  }
  if (query.role && withRole && columns.role) conditions.push(eq(columns.role, query.role))
  if (query.verified) {
    conditions.push(query.verified === 'true' ? isNotNull(schema.users.emailVerifiedAt) : isNull(schema.users.emailVerifiedAt))
  }
  const where = conditions.length ? and(...conditions) : undefined

  // `id` as a tiebreaker keeps pages stable when many rows share the sort value.
  const orderBy = orderByQuery({
    id: schema.users.id,
    name: schema.users.name,
    email: schema.users.email,
    role: withRole ? columns.role : undefined,
    createdAt: schema.users.createdAt,
    lastLoginAt: schema.users.lastLoginAt,
  }, query, { tiebreaker: schema.users.id })

  const { limit, offset } = pageRange(query)
  const [rows, [totals]] = await Promise.all([
    db.select().from(schema.users).where(where).orderBy(...orderBy).limit(limit).offset(offset),
    db.select({ total: count() }).from(schema.users).where(where),
  ])

  const subscriptions = await latestSubscriptions(rows.map(user => user.id))
  const roles = withRole ? await assignableRoles(event, actor.id as number) : []

  return {
    ...paginate({
      total: totals?.total ?? 0,
      query,
      items: rows.map(user => ({ ...toAdminUserDto(user), subscription: subscriptions.get(user.id) ?? null })),
    }),
    hasRoles: withRole,
    hasSubscriptions: !!(schema as unknown as Record<string, unknown>).subscriptions,
    roles,
  }
})
