import { and, count, eq } from 'drizzle-orm'
import type { SQL } from 'drizzle-orm'
import { db, schema } from '@nuxthub/db'
import { z } from 'zod'
import { idParams, orderByQuery, pageQuery, pageRange, paginate } from '@frigear-nu/module-kit/server'
import type { FormsPage, SubmissionSummaryDto } from '../../../../types'

const querySchema = pageQuery({
  sort: ['createdAt', 'deliveryStatus', 'locale'],
  defaultSort: 'createdAt',
  defaultOrder: 'desc',
  filters: {
    deliveryStatus: z.enum(['none', 'pending', 'delivered', 'failed']).optional(),
  },
})

// A form's submissions, newest first. Answers are not searchable (they are JSON); `q` is accepted and ignored.
export default defineEventHandler(async (event): Promise<FormsPage<SubmissionSummaryDto>> => {
  await authorize(event, 'forms:manage')
  const { id } = await getValidatedRouterParams(event, idParams().parse)
  const query = await getValidatedQuery(event, querySchema.parse)
  const form = await findFormById(id)

  const conditions: SQL[] = [eq(schema.formSubmissions.formId, form.id)]
  if (query.deliveryStatus) conditions.push(eq(schema.formSubmissions.deliveryStatus, query.deliveryStatus))
  const where = and(...conditions)
  const orderBy = orderByQuery({
    createdAt: schema.formSubmissions.createdAt,
    deliveryStatus: schema.formSubmissions.deliveryStatus,
    locale: schema.formSubmissions.locale,
  }, query, { tiebreaker: schema.formSubmissions.id })

  const { limit, offset } = pageRange(query)
  const [rows, [totals]] = await Promise.all([
    db.select().from(schema.formSubmissions).where(where).orderBy(...orderBy).limit(limit).offset(offset),
    db.select({ total: count() }).from(schema.formSubmissions).where(where),
  ])
  return paginate({ items: rows.map(toSubmissionSummaryDto), total: totals?.total ?? 0, query })
})
