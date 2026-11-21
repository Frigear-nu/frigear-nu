import { db, schema } from '@nuxthub/db'
import { and, count, eq, is, isNull, sql } from 'drizzle-orm'
import { PgTable } from 'drizzle-orm/pg-core'
import type { SQL } from 'drizzle-orm'
import { escapeLike, orderByQuery, pageRange, paginate } from '@frigear-nu/module-kit/server'
import type { Page } from '@frigear-nu/module-kit/server'
import { teamsAccess } from '../../../access'
import type { AdminTeamDto } from '../../../../types'

/**
 * A translated text (a plain string, or a locale -> text map) contains `value` in any language. Matches the texts
 * only, never the locale keys. sqlite reads the json with `json_each` (a json string scalar yields one row);
 * postgresql with `jsonb_each_text`, wrapping a string scalar in an object first.
 */
function translatedContains(column: typeof schema.teams.name, value: string) {
  const pattern = `%${escapeLike(value)}%`
  if (is(schema.teams, PgTable)) {
    return sql`exists (select 1 from jsonb_each_text(case when jsonb_typeof(${column}) = 'object' then ${column} else jsonb_build_object('_', ${column}) end) as t where lower(t.value) like lower(${pattern}) escape '\\')`
  }
  return sql`exists (select 1 from json_each(${column}) as t where lower(t.value) like lower(${pattern}) escape '\\')`
}

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
  if (query.q) conditions.push(translatedContains(schema.teams.name, query.q))
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
