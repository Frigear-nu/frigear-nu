import { db, schema } from '@nuxthub/db'
import { and, count, eq, or } from 'drizzle-orm'
import { escapeLike, idParams, isoDate, likeEscaped as like, notFound, orderByQuery, pageQuery, pageRange, paginate } from '@frigear-nu/module-kit/server'
import type { AuthorizationRoleUserDto, AuthorizationRoleUsersPageDto } from '../../../../types'

const querySchema = pageQuery({
  sort: ['name', 'email', 'id', 'assignedAt'],
  defaultSort: 'name',
  defaultOrder: 'asc',
})

// `GET /api/admin/authorization/roles/:name/users`: the users with an assigned row for the role, paginated. Default
// and `auto` roles are never stored, so their list is empty.
export default defineEventHandler(async (event): Promise<AuthorizationRoleUsersPageDto> => {
  await authorize(event, 'roles:read')
  const { name } = await getValidatedRouterParams(event, idParams('name').parse)
  const query = await getValidatedQuery(event, querySchema.parse)
  const { table } = useAuthorizationAccessTables()
  if (!Object.hasOwn(table.roles, name)) throw notFound(`Role "${name}" does not exist.`)

  const { users, authorizationUserRoles: roles } = schema
  const pattern = query.q ? `%${escapeLike(query.q)}%` : undefined
  const where = and(
    eq(roles.role, name),
    pattern ? or(like(users.name, pattern), like(users.email, pattern)) : undefined,
  )
  const orderBy = orderByQuery({ name: users.name, email: users.email, id: users.id, assignedAt: roles.createdAt }, query, { tiebreaker: users.id })
  const { limit, offset } = pageRange(query)
  const [rows, [totals]] = await Promise.all([
    db.select({ id: users.id, name: users.name, email: users.email, source: roles.source, createdAt: roles.createdAt })
      .from(roles).innerJoin(users, eq(users.id, roles.userId))
      .where(where).orderBy(...orderBy).limit(limit).offset(offset),
    db.select({ total: count() }).from(roles).innerJoin(users, eq(users.id, roles.userId)).where(where),
  ])
  const items: AuthorizationRoleUserDto[] = rows.map(row => ({
    id: Number(row.id),
    name: row.name,
    email: row.email,
    source: row.source,
    assignedAt: isoDate(row.createdAt),
  }))
  return paginate({ total: Number(totals?.total ?? 0), query, items })
})
