import { db, schema } from '@nuxthub/db'
import { and, count, eq, is, or, sql } from 'drizzle-orm'
import { PgTable } from 'drizzle-orm/pg-core'
import type { SQL } from 'drizzle-orm'
import { z } from 'zod'
import { escapeLike, likeContains, orderByQuery, pageQuery, pageRange, paginate } from '@frigear-nu/module-kit/server'
import type { Page } from '@frigear-nu/module-kit/server'
import { operationsAccess } from '../../../access'
import { OPERATION_STATUSES } from '../../../utils'
import type { AdminOperationDto } from '../../../../types'

/**
 * A translated text (a plain string, or a locale -> text map) contains `value` in any language. Matches the texts
 * only, never the locale keys. sqlite reads the json with `json_each` (a json string scalar yields one row);
 * postgresql with `jsonb_each_text`, wrapping a string scalar in an object first.
 */
function translatedContains(column: typeof schema.operations.name, value: string) {
  const lowered = value.toLocaleLowerCase()
  if (is(schema.operations, PgTable)) {
    // postgresql folds every letter on both sides.
    return sql`exists (select 1 from jsonb_each_text(case when jsonb_typeof(${column}) = 'object' then ${column} else jsonb_build_object('_', ${column}) end) as t where lower(t.value) like lower(${`%${escapeLike(lowered)}%`}) escape '\\')`
  }
  // sqlite's LIKE folds ASCII only, so a stored `Ølbar` matches neither `ølbar` nor `ØLBAR`. Match the query as typed,
  // lowercased (in JS) and with its first letter capitalised, which finds `Ølfestival`, `Århus Bar` or `Bar i Århus` for
  // `ølfestival`, `ØLFESTIVAL` or `århus`.
  const variants = [...new Set([value, lowered, lowered.charAt(0).toLocaleUpperCase() + lowered.slice(1)])]
  const matches = sql.join(variants.map(variant => sql`t.value like ${`%${escapeLike(variant)}%`} escape '\\'`), sql` or `)
  return sql`exists (select 1 from json_each(${column}) as t where ${matches})`
}

const querySchema = pageQuery({
  sort: ['startsAt', 'createdAt', 'slug', 'status'],
  defaultSort: 'startsAt',
  filters: {
    status: z.enum(OPERATION_STATUSES).optional(),
  },
})

// Every operation, whatever its status and visibility, newest start first by default (`sort` and `order` change it). `q` searches the name (every language) and
// the slug.
export default defineEventHandler(async (event): Promise<Page<AdminOperationDto>> => {
  await authorize(event, operationsAccess.permissions.manage)
  const query = await getValidatedQuery(event, querySchema.parse)

  const conditions: (SQL | undefined)[] = []
  if (query.q) conditions.push(or(translatedContains(schema.operations.name, query.q), likeContains(schema.operations.slug, query.q)))
  if (query.status) conditions.push(eq(schema.operations.status, query.status))
  const where = conditions.length ? and(...conditions) : undefined

  const orderBy = orderByQuery({
    startsAt: schema.operations.startsAt,
    createdAt: schema.operations.createdAt,
    slug: schema.operations.slug,
    status: schema.operations.status,
  }, query, { tiebreaker: schema.operations.id })

  const { limit, offset } = pageRange(query)
  const [rows, [totals]] = await Promise.all([
    db.select().from(schema.operations).where(where).orderBy(...orderBy).limit(limit).offset(offset),
    db.select({ total: count() }).from(schema.operations).where(where),
  ])
  return paginate({ total: totals?.total ?? 0, query, items: rows.map(toAdminOperationDto) })
})
