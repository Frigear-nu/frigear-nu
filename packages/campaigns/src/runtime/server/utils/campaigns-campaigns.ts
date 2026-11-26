import { db, schema } from '@nuxthub/db'
import { and, count, eq, inArray, sql } from 'drizzle-orm'
import type { SQL } from 'drizzle-orm'
import { z } from 'zod'
import { apiError, chunkParams, isoDate, likeContains, notFound, orderByQuery, pageQuery, pageRange, paginate } from '@frigear-nu/module-kit/server'
import type { Page } from '@frigear-nu/module-kit/server'
import { newId } from '@frigear-nu/module-kit/id'
import type {
  CampaignChannelCounts,
  CampaignCounts,
  CampaignDeliveryDto,
  CampaignDto,
  CampaignLinkStatsDto,
  CampaignSendChannel,
  CampaignStatsDto,
} from '../../../types'
import type { campaignCreateInput, campaignPatchInput } from '../../utils/schemas'
import type { CampaignContactRow } from './campaigns-dto'

// Campaigns as staff manage them: drafts, the list, stats and the per-recipient rows.

export type CampaignRow = typeof schema.campaigns.$inferSelect
export type CampaignDeliveryRow = typeof schema.campaignDeliveries.$inferSelect

/** A campaign as staff see it: no materializing state, origin or resolved recipients. */
export function toCampaignDto(row: CampaignRow): CampaignDto {
  return {
    id: row.id,
    kind: row.kind,
    name: row.name,
    channels: row.channels,
    audience: row.audience,
    content: row.content,
    locale: row.locale ?? null,
    trackClicks: row.trackClicks,
    trackOpens: row.trackOpens,
    important: row.important,
    status: row.status,
    scheduledAt: isoDate(row.scheduledAt),
    startedAt: isoDate(row.startedAt),
    finishedAt: isoDate(row.finishedAt),
    cancelledAt: isoDate(row.cancelledAt),
    createdBy: row.createdBy ?? null,
    sentBy: row.sentBy ?? null,
    counts: row.counts ?? null,
    createdAt: isoDate(row.createdAt),
    updatedAt: isoDate(row.updatedAt),
  }
}

/** `GET /api/admin/campaigns`: `useTableQuery`'s keys plus `status` and `kind` (`all`: any). */
export const campaignsListQuery = pageQuery({
  sort: ['createdAt', 'scheduledAt', 'name', 'status'],
  filters: {
    status: z.enum(['all', 'draft', 'scheduled', 'sending', 'sent', 'cancelled']).default('all'),
    kind: z.enum(['all', 'newsletter', 'message']).default('all'),
  },
})

export async function listCampaigns(query: z.output<typeof campaignsListQuery>): Promise<Page<CampaignDto>> {
  const c = schema.campaigns
  const conditions: SQL[] = []
  if (query.status !== 'all') conditions.push(eq(c.status, query.status))
  if (query.kind !== 'all') conditions.push(eq(c.kind, query.kind))
  if (query.q) conditions.push(likeContains(c.name, query.q))
  const where = conditions.length ? and(...conditions) : undefined
  const [total] = await db.select({ total: count() }).from(c).where(where)
  const { limit, offset } = pageRange(query)
  const rows = await db.select().from(c).where(where)
    .orderBy(...orderByQuery({ createdAt: c.createdAt, scheduledAt: c.scheduledAt, name: c.name, status: c.status }, query, { tiebreaker: c.id }))
    .limit(limit).offset(offset)
  // Opens and clicks keep arriving after a campaign is sent, so the counts come from the delivery rows while they exist;
  // the ones kept on the campaign are only for campaigns whose rows retention has deleted.
  const live = await campaignDeliveryCountsMany(rows.filter(row => row.startedAt).map(row => row.id))
  const items = rows.map(row => ({ ...toCampaignDto(row), counts: live.get(row.id) ?? row.counts ?? null }))
  return paginate({ items, total: Number(total?.total ?? 0), query })
}

export async function findCampaign(id: string): Promise<CampaignRow | undefined> {
  const [row] = await db.select().from(schema.campaigns).where(eq(schema.campaigns.id, id)).limit(1)
  return row
}

export async function getCampaignOr404(id: string): Promise<CampaignRow> {
  const row = await findCampaign(id)
  if (!row) throw notFound('Campaign not found.')
  return row
}

/** 409 `not_draft` unless the campaign is still a draft: only drafts change. */
export function campaignsRequireDraft(row: CampaignRow): void {
  if (row.status !== 'draft') throw apiError(409, 'not_draft', 'Only a draft campaign can be changed.', { status: row.status })
}

export async function createCampaign(input: z.output<typeof campaignCreateInput>, createdBy: number | null): Promise<CampaignRow> {
  const id = newId('cmp')
  await db.insert(schema.campaigns).values({
    id,
    kind: input.kind,
    name: input.name,
    channels: input.channels,
    audience: input.audience,
    content: input.content,
    locale: input.locale ?? null,
    trackClicks: input.trackClicks,
    trackOpens: input.trackOpens,
    important: input.important,
    status: 'draft',
    createdBy,
  })
  return getCampaignOr404(id)
}

export async function updateCampaign(row: CampaignRow, patch: z.output<typeof campaignPatchInput>): Promise<CampaignRow> {
  const changes: Partial<typeof schema.campaigns.$inferInsert> = {}
  for (const key of ['name', 'channels', 'audience', 'content', 'locale', 'trackClicks', 'trackOpens', 'important'] as const) {
    if (patch[key] !== undefined) (changes as Record<string, unknown>)[key] = patch[key]
  }
  if (!Object.keys(changes).length) return row
  // Only while it is a draft: a send started meanwhile wins.
  await db.update(schema.campaigns).set({ ...changes, updatedAt: new Date() })
    .where(and(eq(schema.campaigns.id, row.id), eq(schema.campaigns.status, 'draft')))
  const updated = await getCampaignOr404(row.id)
  campaignsRequireDraft(updated)
  return updated
}

/** Deletes a draft (it has no deliveries or links yet). */
export async function deleteCampaign(row: CampaignRow): Promise<void> {
  await db.delete(schema.campaigns).where(and(eq(schema.campaigns.id, row.id), eq(schema.campaigns.status, 'draft')))
}

const emptyChannelCounts = (): CampaignChannelCounts => ({ total: 0, queued: 0, sent: 0, skipped: 0, failed: 0, opened: 0, clicked: 0, clicks: 0 })

/** Counts per channel from the delivery rows (`queued` includes claimed rows). */
export async function campaignDeliveryCounts(campaignId: string): Promise<CampaignCounts> {
  return (await campaignDeliveryCountsMany([campaignId])).get(campaignId) ?? {}
}

/** {@link campaignDeliveryCounts} for several campaigns; a campaign without delivery rows is left out of the map. */
export async function campaignDeliveryCountsMany(campaignIds: readonly string[]): Promise<Map<string, CampaignCounts>> {
  const d = schema.campaignDeliveries
  const result = new Map<string, CampaignCounts>()
  for (const ids of chunkParams(campaignIds)) {
    const rows = await db.select({
      campaignId: d.campaignId,
      channel: d.channel,
      status: d.status,
      total: count(),
      opened: sql<number>`sum(case when ${d.openedAt} is not null then 1 else 0 end)`,
      clicked: sql<number>`sum(case when ${d.clickedAt} is not null then 1 else 0 end)`,
      clicks: sql<number>`sum(${d.clicks})`,
    }).from(d).where(inArray(d.campaignId, ids)).groupBy(d.campaignId, d.channel, d.status)
    for (const row of rows) {
      let counts = result.get(row.campaignId)
      if (!counts) result.set(row.campaignId, counts = {})
      const entry = counts[row.channel as CampaignSendChannel] ??= emptyChannelCounts()
      const total = Number(row.total)
      entry.total += total
      if (row.status === 'sending' || row.status === 'queued') entry.queued += total
      else entry[row.status as 'sent' | 'skipped' | 'failed'] += total
      entry.opened += Number(row.opened ?? 0)
      entry.clicked += Number(row.clicked ?? 0)
      entry.clicks += Number(row.clicks ?? 0)
    }
  }
  return result
}

/**
 * Counts (from the rows while they exist, else the ones kept on the campaign), skipped rows by reason (while the rows
 * exist) and clicks per link.
 */
export async function campaignStats(row: CampaignRow): Promise<CampaignStatsDto> {
  const live = await campaignDeliveryCounts(row.id)
  const counts = Object.keys(live).length ? live : (row.counts ?? {})
  const l = schema.campaignLinks
  const k = schema.campaignClicks
  const links = await db.select().from(l).where(eq(l.campaignId, row.id)).orderBy(l.position)
  const clickRows = await db.select({
    linkId: k.linkId,
    clicks: count(),
    recipients: sql<number>`count(distinct ${k.deliveryId})`,
  }).from(k).innerJoin(l, eq(k.linkId, l.id)).where(eq(l.campaignId, row.id)).groupBy(k.linkId)
  const byLink = new Map(clickRows.map(entry => [entry.linkId, entry]))
  const d = schema.campaignDeliveries
  const skipRows = await db.select({ reason: d.skipReason, total: count() }).from(d)
    .where(and(eq(d.campaignId, row.id), eq(d.status, 'skipped'))).groupBy(d.skipReason)
  const skipReasons: Partial<Record<string, number>> = {}
  for (const entry of skipRows) {
    const reason = entry.reason ?? 'unavailable'
    skipReasons[reason] = (skipReasons[reason] ?? 0) + Number(entry.total)
  }
  return {
    status: row.status,
    counts,
    skipReasons,
    links: links.map((link): CampaignLinkStatsDto => ({
      id: link.id,
      url: link.url,
      shortLinkId: link.shortLinkId,
      position: link.position,
      clicks: Number(byLink.get(link.id)?.clicks ?? 0),
      recipients: Number(byLink.get(link.id)?.recipients ?? 0),
    })),
  }
}

/** `GET /api/admin/campaigns/users`: a search term, or the ids of people to name (`1,2,3`, at most 200). */
export const campaignsUserLookupQuery = z.object({
  q: z.string().trim().max(200).optional(),
  ids: z.string().trim().max(2000).optional()
    .transform(value => value ? value.split(',').map(id => id.trim()).filter(id => /^\d+$/.test(id)).slice(0, 200) : []),
})

/** `GET /api/admin/campaigns/:id/deliveries`: `useTableQuery`'s keys plus `status` and `channel`. */
export const campaignDeliveriesQuery = pageQuery({
  sort: ['sentAt', 'status', 'channel'],
  filters: {
    status: z.enum(['all', 'queued', 'sending', 'sent', 'skipped', 'failed']).default('all'),
    channel: z.enum(['all', 'email', 'sms', 'push']).default('all'),
  },
})

/** A page of a campaign's deliveries with the recipient (the contact's address on the channel). Callers hold `campaigns:pii`. */
export async function listCampaignDeliveries(row: CampaignRow, query: z.output<typeof campaignDeliveriesQuery>): Promise<Page<CampaignDeliveryDto>> {
  const d = schema.campaignDeliveries
  const c = schema.campaignContacts
  const u = schema.users
  const conditions: SQL[] = [eq(d.campaignId, row.id)]
  if (query.status !== 'all') conditions.push(eq(d.status, query.status))
  if (query.channel !== 'all') conditions.push(eq(d.channel, query.channel))
  const where = and(...conditions)
  const [total] = await db.select({ total: count() }).from(d).where(where)
  const { limit, offset } = pageRange(query)
  const rows = await db.select({ delivery: d, contact: c, userName: u.name })
    .from(d)
    .leftJoin(c, eq(d.contactId, c.id))
    .leftJoin(u, eq(d.userId, u.id))
    .where(where)
    .orderBy(...orderByQuery({ sentAt: d.sentAt, status: d.status, channel: d.channel }, query, { tiebreaker: d.id }))
    .limit(limit).offset(offset)
  return paginate({
    items: rows.map((row): CampaignDeliveryDto => toCampaignDeliveryDto(row.delivery, row.contact, row.userName)),
    total: Number(total?.total ?? 0),
    query,
  })
}

/** One delivery with its recipient: the contact's address on the channel; a user's name only. */
export function toCampaignDeliveryDto(delivery: CampaignDeliveryRow, contact: CampaignContactRow | null, userName: string | null): CampaignDeliveryDto {
  return {
    id: delivery.id,
    channel: delivery.channel,
    status: delivery.status,
    skipReason: delivery.skipReason ?? null,
    attempts: delivery.attempts,
    sentAt: isoDate(delivery.sentAt),
    openedAt: isoDate(delivery.openedAt),
    clickedAt: isoDate(delivery.clickedAt),
    clicks: delivery.clicks,
    error: delivery.error ?? null,
    recipient: {
      userId: delivery.userId ?? null,
      contactId: delivery.contactId ?? null,
      name: contact?.name ?? userName ?? null,
      address: contact ? (delivery.channel === 'sms' ? contact.phone : contact.email) ?? null : null,
    },
  }
}
