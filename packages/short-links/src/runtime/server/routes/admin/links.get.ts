import { db, schema } from '@nuxthub/db'
import { and, count, eq, gt, isNotNull, isNull, lte, ne, or } from 'drizzle-orm'
import type { SQL } from 'drizzle-orm'
import { z } from 'zod'
import { likeContains, orderByQuery, pageQuery, pageRange, paginate } from '@frigear-nu/module-kit/server'
import type { Page } from '@frigear-nu/module-kit/server'
import type { ShortLinkDto } from '../../../../types'
import { shortLinksAccess } from '../../../access'
import { SHORT_LINKS_MANUAL_OWNER } from '../../../utils/codes'

const querySchema = pageQuery({
  sort: ['createdAt', 'clicks', 'lastClickedAt', 'code'],
  defaultSort: 'createdAt',
  filters: {
    /** `manual`: links made by hand on the admin page; `modules`: links other modules made. */
    source: z.enum(['manual', 'modules']).optional(),
    /** The owner module (`short-links` for links made by hand). */
    owner: z.string().trim().min(1).max(64).optional(),
    status: z.enum(['active', 'disabled', 'expired']).optional(),
  },
})

// Every short link, newest first. `q` searches the code, the target and the title.
export default defineEventHandler(async (event): Promise<Page<ShortLinkDto>> => {
  await authorize(event, shortLinksAccess.permissions.manage)
  const query = await getValidatedQuery(event, querySchema.parse)
  const t = schema.shortLinks
  const now = new Date()

  const conditions: (SQL | undefined)[] = []
  if (query.q) conditions.push(or(likeContains(t.code, query.q), likeContains(t.url, query.q), likeContains(t.title, query.q)))
  if (query.source === 'manual') conditions.push(eq(t.ownerModule, SHORT_LINKS_MANUAL_OWNER))
  if (query.source === 'modules') conditions.push(ne(t.ownerModule, SHORT_LINKS_MANUAL_OWNER))
  if (query.owner) conditions.push(eq(t.ownerModule, query.owner))
  if (query.status === 'disabled') conditions.push(isNotNull(t.disabledAt))
  if (query.status === 'expired') conditions.push(isNull(t.disabledAt), lte(t.expiresAt, now))
  if (query.status === 'active') conditions.push(isNull(t.disabledAt), or(isNull(t.expiresAt), gt(t.expiresAt, now)))
  const where = conditions.length ? and(...conditions) : undefined

  const orderBy = orderByQuery({
    createdAt: t.createdAt,
    clicks: t.clicks,
    lastClickedAt: t.lastClickedAt,
    code: t.code,
  }, query, { tiebreaker: t.id })

  const { limit, offset } = pageRange(query)
  const [rows, [totals]] = await Promise.all([
    db.select().from(t).where(where).orderBy(...orderBy).limit(limit).offset(offset),
    db.select({ total: count() }).from(t).where(where),
  ])
  return paginate({ total: totals?.total ?? 0, query, items: rows.map(row => toShortLinkDto(toShortLink(row), event)) })
})
