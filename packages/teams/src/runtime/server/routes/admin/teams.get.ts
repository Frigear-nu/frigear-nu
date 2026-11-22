import { db, schema } from '@nuxthub/db'
import { and, count, eq, isNull } from 'drizzle-orm'
import type { SQL } from 'drizzle-orm'
import { orderByQuery, pageRange, paginate, searchContains } from '@frigear-nu/module-kit/server'
import type { Page } from '@frigear-nu/module-kit/server'
import { teamsAccess } from '../../../access'
import type { AdminTeamDto } from '../../../../types'

// Every team, filtered by owner (`ownerType`, `ownerId`; `ownerType=platform` alone lists the platform's teams) and
// kind, `q` searching the name in every language. Ordered by `sort` by default.
export default defineEventHandler(async (event): Promise<Page<AdminTeamDto>> => {
  await authorize(event, teamsAccess.permissions.manage)
  const query = await getValidatedQuery(event, teamListQuery.parse)

  const conditions: (SQL | undefined)[] = []
  if (query.ownerType) conditions.push(eq(schema.teams.ownerType, query.ownerType))
  if (query.ownerId) conditions.push(eq(schema.teams.ownerId, query.ownerId))
  else if (query.ownerType === 'platform') conditions.push(isNull(schema.teams.ownerId))
  if (query.kind) conditions.push(eq(schema.teams.kind, query.kind))
  // The folded search column: `Ø`, `Æ` and `Å` match in any case on sqlite too.
  if (query.q) conditions.push(searchContains(schema.teams.searchText, query.q))
  const where = conditions.length ? and(...conditions) : undefined

  const orderBy = orderByQuery({
    sort: schema.teams.sort,
    createdAt: schema.teams.createdAt,
    kind: schema.teams.kind,
  }, query, { tiebreaker: schema.teams.createdAt })

  const { limit, offset } = pageRange(query)
  const [rows, [totals]] = await Promise.all([
    db.select().from(schema.teams).where(where).orderBy(...orderBy).limit(limit).offset(offset),
    db.select({ total: count() }).from(schema.teams).where(where),
  ])
  return paginate({ total: totals?.total ?? 0, query, items: await toAdminTeamDtos(event, rows) })
})
