import { db, schema } from '@nuxthub/db'
import { and, count, eq, is, isNull, or, sql } from 'drizzle-orm'
import { PgTable } from 'drizzle-orm/pg-core'
import type { SQL } from 'drizzle-orm'
import { escapeLike, likeContains, orderByQuery, pageRange, paginate } from '@frigear-nu/module-kit/server'
import type { Page } from '@frigear-nu/module-kit/server'
import { mapsAccess } from '../../../access'
import type { AdminMapDto } from '../../../../types'

/**
 * A translated text (a plain string, or a locale -> text map) contains `value` in any language. Matches the texts
 * only, never the locale keys. sqlite reads the json with `json_each` (a json string scalar yields one row);
 * postgresql with `jsonb_each_text`, wrapping a string scalar in an object first.
 */
function translatedContains(column: typeof schema.maps.name, value: string) {
  const pattern = `%${escapeLike(value)}%`
  if (is(schema.maps, PgTable)) {
    return sql`exists (select 1 from jsonb_each_text(case when jsonb_typeof(${column}) = 'object' then ${column} else jsonb_build_object('_', ${column}) end) as t where lower(t.value) like lower(${pattern}) escape '\\')`
  }
  return sql`exists (select 1 from json_each(${column}) as t where lower(t.value) like lower(${pattern}) escape '\\')`
}

// Every map, filtered by owner (`ownerType`, `ownerId`; `ownerType=platform` alone lists the platform's) and kind, `q`
// searching the name in every language and the key. Most recently changed first by default.
export default defineEventHandler(async (event): Promise<Page<AdminMapDto>> => {
  await authorize(event, mapsAccess.permissions.manage)
  const query = await getValidatedQuery(event, mapsAdminListQuery.parse)

  const conditions: (SQL | undefined)[] = []
  if (query.ownerType) conditions.push(eq(schema.maps.ownerType, query.ownerType))
  if (query.ownerId) conditions.push(eq(schema.maps.ownerId, query.ownerId))
  else if (query.ownerType === 'platform') conditions.push(isNull(schema.maps.ownerId))
  if (query.kind) conditions.push(eq(schema.maps.kind, query.kind))
  if (query.q) conditions.push(or(translatedContains(schema.maps.name, query.q), likeContains(schema.maps.key, query.q)))
  const where = conditions.length ? and(...conditions) : undefined

  const orderBy = orderByQuery({
    updatedAt: schema.maps.updatedAt,
    createdAt: schema.maps.createdAt,
    kind: schema.maps.kind,
  }, query, { tiebreaker: schema.maps.id })

  const { limit, offset } = pageRange(query)
  const [rows, [totals]] = await Promise.all([
    db.select().from(schema.maps).where(where).orderBy(...orderBy).limit(limit).offset(offset),
    db.select({ total: count() }).from(schema.maps).where(where),
  ])
  return paginate({ total: Number(totals?.total ?? 0), query, items: await toAdminMapDtos(event, rows) })
})
