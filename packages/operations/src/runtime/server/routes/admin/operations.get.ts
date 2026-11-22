import { db, schema } from '@nuxthub/db'
import { and, count, eq } from 'drizzle-orm'
import type { SQL } from 'drizzle-orm'
import { z } from 'zod'
import { orderByQuery, pageQuery, pageRange, paginate, searchContains } from '@frigear-nu/module-kit/server'
import type { Page } from '@frigear-nu/module-kit/server'
import { operationsAccess } from '../../../access'
import { OPERATION_STATUSES } from '../../../utils'
import type { AdminOperationDto } from '../../../../types'

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
  // The folded search column: `Ø`, `Æ` and `Å` match in any case on sqlite too.
  if (query.q) conditions.push(searchContains(schema.operations.searchText, query.q))
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
