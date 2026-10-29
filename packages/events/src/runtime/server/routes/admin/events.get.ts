import { db, schema } from '@nuxthub/db'
import { and, count, eq, is, or, sql } from 'drizzle-orm'
import { PgTable } from 'drizzle-orm/pg-core'
import type { SQL } from 'drizzle-orm'
import { z } from 'zod'
import { escapeLike, likeContains, orderByQuery, pageQuery, pageRange, paginate } from '@frigear-nu/module-kit/server'
import type { Page } from '@frigear-nu/module-kit/server'
import type { AdminEventDto } from '../../../../types'

/**
 * A translated text (a plain string, or a locale -> text map) contains `value` in any language. Matches the texts
 * only, never the locale keys (so `q=en` does not match every event). sqlite reads the json with `json_each` (a json
 * string scalar yields one row); postgresql with `jsonb_each_text`, wrapping a string scalar in an object first.
 */
function translatedContains(column: typeof schema.events.name, value: string) {
  const pattern = `%${escapeLike(value)}%`
  if (is(schema.events, PgTable)) {
    return sql`exists (select 1 from jsonb_each_text(case when jsonb_typeof(${column}) = 'object' then ${column} else jsonb_build_object('_', ${column}) end) as t where lower(t.value) like lower(${pattern}) escape '\\')`
  }
  return sql`exists (select 1 from json_each(${column}) as t where lower(t.value) like lower(${pattern}) escape '\\')`
}

const querySchema = pageQuery({
  sort: ['startsAt', 'createdAt', 'slug', 'status'],
  defaultSort: 'startsAt',
  filters: {
    status: z.enum(['draft', 'published', 'archived']).optional(),
  },
})

// Every event, whatever its status, newest start first. `q` searches the name (every language) and the slug.
export default defineEventHandler(async (event): Promise<Page<AdminEventDto>> => {
  await eventsStaff.require(event)
  const query = await getValidatedQuery(event, querySchema.parse)

  const conditions: (SQL | undefined)[] = []
  if (query.q) conditions.push(or(translatedContains(schema.events.name, query.q), likeContains(schema.events.slug, query.q)))
  if (query.status) conditions.push(eq(schema.events.status, query.status))
  const where = conditions.length ? and(...conditions) : undefined

  const orderBy = orderByQuery({
    startsAt: schema.events.startsAt,
    createdAt: schema.events.createdAt,
    slug: schema.events.slug,
    status: schema.events.status,
  }, query, { tiebreaker: schema.events.id })

  const { limit, offset } = pageRange(query)
  const [rows, [totals]] = await Promise.all([
    db.select().from(schema.events).where(where).orderBy(...orderBy).limit(limit).offset(offset),
    db.select({ total: count() }).from(schema.events).where(where),
  ])
  return paginate({ total: totals?.total ?? 0, query, items: rows.map(toAdminEventDto) })
})
