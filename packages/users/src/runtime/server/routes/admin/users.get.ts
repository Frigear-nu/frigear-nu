import { db, schema } from '@nuxthub/db'
import { and, asc, count, desc, eq, isNotNull, isNull, or, sql } from 'drizzle-orm'
import type { SQL, AnyColumn } from 'drizzle-orm'
import { z } from 'zod'

const querySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  q: z.string().trim().max(200).optional(),
  role: z.string().trim().min(1).max(60).optional(),
  verified: z.enum(['true', 'false']).optional(),
  sort: z.enum(['id', 'name', 'email', 'role', 'createdAt', 'lastLoginAt']).default('createdAt'),
  order: z.enum(['asc', 'desc']).default('desc'),
})

const like = (column: AnyColumn, pattern: string) => sql`${column} like ${pattern} escape '\\'`

/** Escapes LIKE wildcards so a search for `50%` matches literally. */
const escapeLike = (value: string) => value.replace(/[\\%_]/g, char => `\\${char}`)

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

  const sortColumn = query.sort === 'role'
    ? (withRole ? columns.role : undefined)
    : schema.users[query.sort]
  const direction = query.order === 'asc' ? asc : desc
  // `id` as a tiebreaker keeps pages stable when many rows share the sort value.
  const orderBy = [...(sortColumn ? [direction(sortColumn)] : []), desc(schema.users.id)]

  const [rows, [totals]] = await Promise.all([
    db.select().from(schema.users).where(where).orderBy(...orderBy)
      .limit(query.pageSize).offset((query.page - 1) * query.pageSize),
    db.select({ total: count() }).from(schema.users).where(where),
  ])

  const subscriptions = await latestSubscriptions(rows.map(user => user.id))
  const roles = withRole ? await assignableRoles(event, actor.id as number) : []

  // Never expose the password hash.
  return {
    items: rows.map(user => ({
      subscription: subscriptions.get(user.id) ?? null,
      id: user.id,
      name: user.name,
      email: user.email,
      ...(withRole ? { role: (user as { role?: string }).role } : {}),
      emailVerifiedAt: user.emailVerifiedAt,
      lastLoginAt: user.lastLoginAt,
      createdAt: user.createdAt,
    })),
    total: totals?.total ?? 0,
    page: query.page,
    pageSize: query.pageSize,
    hasRoles: withRole,
    hasSubscriptions: !!(schema as unknown as Record<string, unknown>).subscriptions,
    roles,
  }
})
