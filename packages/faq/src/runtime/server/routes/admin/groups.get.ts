import { db, schema } from '@nuxthub/db'
import { and, count, or } from 'drizzle-orm'
import type { SQL } from 'drizzle-orm'
import { likeContains, orderByQuery, pageQuery, pageRange, paginate } from '@frigear-nu/module-kit/server'
import type { Page } from '@frigear-nu/module-kit/server'
import { faqAccess } from '../../../access'
import type { AdminFaqGroupDto } from '../../../../types'

const querySchema = pageQuery({
  sort: ['sort', 'createdAt', 'slug'],
  defaultSort: 'sort',
  defaultOrder: 'asc',
})

// Every group, whatever its visibility, in their order by default (`sort` and `order` change it). `q` searches the title
// (every language) and the slug.
export default defineEventHandler(async (event): Promise<Page<AdminFaqGroupDto>> => {
  await authorize(event, faqAccess.permissions.manage)
  const query = await getValidatedQuery(event, querySchema.parse)

  const conditions: (SQL | undefined)[] = []
  if (query.q) conditions.push(or(faqTranslatedContains(schema.faqGroups.title, query.q), likeContains(schema.faqGroups.slug, query.q)))
  const where = conditions.length ? and(...conditions) : undefined

  const orderBy = orderByQuery({
    sort: schema.faqGroups.sort,
    createdAt: schema.faqGroups.createdAt,
    slug: schema.faqGroups.slug,
  }, query, { tiebreaker: schema.faqGroups.id })

  const { limit, offset } = pageRange(query)
  const [rows, [totals]] = await Promise.all([
    db.select().from(schema.faqGroups).where(where).orderBy(...orderBy).limit(limit).offset(offset),
    db.select({ total: count() }).from(schema.faqGroups).where(where),
  ])
  const counts = await faqGroupCounts(rows.map(row => row.id))
  return paginate({ total: totals?.total ?? 0, query, items: rows.map(row => toAdminFaqGroupDto(row, counts.get(row.id))) })
})
