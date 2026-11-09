import { db, schema } from '@nuxthub/db'
import { and, count, eq, or } from 'drizzle-orm'
import { escapeLike, idParams, likeEscaped as like, orderByQuery, pageQuery, pageRange, paginate } from '@frigear-nu/module-kit/server'
import type { AuthorizationRoleUsersPageDto } from '../../../../types'

const querySchema = pageQuery({
  sort: ['name', 'email', 'id'],
  defaultSort: 'name',
  defaultOrder: 'asc',
})

// `GET /api/admin/authorization/roles/:name/users`: the users whose stored role is `name`, paginated.
export default defineEventHandler(async (event): Promise<AuthorizationRoleUsersPageDto> => {
  await requireRolesStaff(event)
  const { name } = await getValidatedRouterParams(event, idParams('name').parse)
  const query = await getValidatedQuery(event, querySchema.parse)
  const { role } = requireAuthorizationRole(name)

  const users = schema.users as typeof schema.users & { role: typeof schema.users.name }
  const pattern = query.q ? `%${escapeLike(query.q)}%` : undefined
  const where = and(
    eq(users.role, role.name),
    pattern ? or(like(users.name, pattern), like(users.email, pattern)) : undefined,
  )
  const orderBy = orderByQuery({ name: users.name, email: users.email, id: users.id }, query, { tiebreaker: users.id })
  const { limit, offset } = pageRange(query)
  const [rows, [totals]] = await Promise.all([
    db.select({ id: users.id, name: users.name, email: users.email }).from(users).where(where).orderBy(...orderBy).limit(limit).offset(offset),
    db.select({ total: count() }).from(users).where(where),
  ])
  return paginate({ total: totals?.total ?? 0, query, items: rows.map(toAuthorizationRoleUserDto) })
})
