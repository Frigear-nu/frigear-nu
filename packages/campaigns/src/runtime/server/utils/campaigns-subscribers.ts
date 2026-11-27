import { db, schema } from '@nuxthub/db'
import { and, count, eq, or } from 'drizzle-orm'
import type { SQL } from 'drizzle-orm'
import { z } from 'zod'
import { likeContains, orderByQuery, pageQuery, pageRange, paginate } from '@frigear-nu/module-kit/server'
import type { Page } from '@frigear-nu/module-kit/server'
import type { CampaignSubscriberDto } from '../../../types'
import { toCampaignSubscriberDto } from './campaigns-dto'
import type { CampaignListRow } from './campaigns-dto'

/** `GET /api/admin/campaigns/lists/:id/subscribers`: `useTableQuery`'s keys plus `status` and `channel` (`all`: any). */
export const campaignSubscribersQuery = pageQuery({
  sort: ['requestedAt', 'confirmedAt', 'status', 'channel'],
  filters: {
    status: z.enum(['all', 'pending', 'active', 'unsubscribed']).default('all'),
    channel: z.enum(['all', 'email', 'sms']).default('all'),
  },
})

/** A page of a list's subscriptions with their contacts; addresses only when `pii`. */
export async function campaignListSubscribers(list: CampaignListRow, query: z.output<typeof campaignSubscribersQuery>, pii: boolean): Promise<Page<CampaignSubscriberDto>> {
  const s = schema.campaignSubscriptions
  const c = schema.campaignContacts
  const conditions: SQL[] = [eq(s.listId, list.id)]
  if (query.status !== 'all') conditions.push(eq(s.status, query.status))
  if (query.channel !== 'all') conditions.push(eq(s.channel, query.channel))
  if (query.q) {
    // Without `campaigns:pii` an address is not even searchable: a match would tell it.
    conditions.push(pii ? or(likeContains(c.name, query.q), likeContains(c.email, query.q), likeContains(c.phone, query.q))! : likeContains(c.name, query.q))
  }
  const where = and(...conditions)
  const [total] = await db.select({ total: count() }).from(s).innerJoin(c, eq(s.contactId, c.id)).where(where)
  const rows = await db.select({ subscription: s, contact: c }).from(s).innerJoin(c, eq(s.contactId, c.id)).where(where)
    .orderBy(...orderByQuery({ requestedAt: s.requestedAt, confirmedAt: s.confirmedAt, status: s.status, channel: s.channel }, query, { tiebreaker: s.id }))
    .limit(pageRange(query).limit).offset(pageRange(query).offset)
  return paginate({ items: rows.map(row => toCampaignSubscriberDto(row.subscription, row.contact, pii)), total: Number(total?.total ?? 0), query })
}
