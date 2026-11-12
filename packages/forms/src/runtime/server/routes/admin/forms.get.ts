import { and, count, eq, inArray, ne, or, sql } from 'drizzle-orm'
import type { SQL } from 'drizzle-orm'
import { db, schema } from '@nuxthub/db'
import { z } from 'zod'
import { likeContains, orderByQuery, pageQuery, pageRange, paginate } from '@frigear-nu/module-kit/server'
import type { FormSummaryDto, FormsPage } from '../../../../types'

const querySchema = pageQuery({
  sort: ['updatedAt', 'createdAt', 'name', 'slug', 'status', 'submissionCount'],
  defaultSort: 'updatedAt',
  defaultOrder: 'desc',
  filters: {
    status: z.enum(['draft', 'published', 'archived']).optional(),
    /** `false` hides archived forms (ignored when `status` is set). */
    archived: z.enum(['true', 'false']).optional(),
  },
})

// `q` searches name and slug; `status` / `archived` filter.
export default defineEventHandler(async (event): Promise<FormsPage<FormSummaryDto>> => {
  await authorize(event, 'forms:manage')
  const query = await getValidatedQuery(event, querySchema.parse)

  const conditions: (SQL | undefined)[] = []
  if (query.q) conditions.push(or(likeContains(schema.forms.name, query.q), likeContains(schema.forms.slug, query.q)))
  if (query.status) conditions.push(eq(schema.forms.status, query.status))
  else if (query.archived === 'false') conditions.push(ne(schema.forms.status, 'archived'))
  const where = conditions.length ? and(...conditions) : undefined

  const submissionCount = sql`(select count(*) from ${schema.formSubmissions} where ${schema.formSubmissions.formId} = ${schema.forms.id})`
  const orderBy = orderByQuery({
    updatedAt: schema.forms.updatedAt,
    createdAt: schema.forms.createdAt,
    name: schema.forms.name,
    slug: schema.forms.slug,
    status: schema.forms.status,
    submissionCount,
  }, query, { tiebreaker: schema.forms.id })

  const { limit, offset } = pageRange(query)
  const [rows, [totals]] = await Promise.all([
    db.select().from(schema.forms).where(where).orderBy(...orderBy).limit(limit).offset(offset),
    db.select({ total: count() }).from(schema.forms).where(where),
  ])
  const counts = rows.length
    ? await db.select({ formId: schema.formSubmissions.formId, total: count() }).from(schema.formSubmissions)
        .where(inArray(schema.formSubmissions.formId, rows.map(row => row.id)))
        .groupBy(schema.formSubmissions.formId)
    : []
  const totalsByForm = new Map(counts.map(row => [row.formId, row.total]))
  return paginate({ items: rows.map(row => toFormSummaryDto(row, totalsByForm.get(row.id) ?? 0)), total: totals?.total ?? 0, query })
})
