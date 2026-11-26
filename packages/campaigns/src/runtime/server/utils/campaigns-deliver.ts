import type { H3Event } from 'h3'
import { db, schema } from '@nuxthub/db'
import { and, asc, eq, inArray, isNotNull, lt, lte, sql } from 'drizzle-orm'
import { recipientStore } from '#notify/stores'
import { apiError, chunkParams, inChunks, validationError } from '@frigear-nu/module-kit/server'
import { newId } from '@frigear-nu/module-kit/id'
import type { CampaignSendChannel } from '../../../types'
import { CAMPAIGNS_TOPICS } from '../../notifications'
import { campaignsApi } from '../../utils/api'
import {
  CAMPAIGN_CLAIM_STALE_MS,
  campaignLinkSources,
  campaignNotifyOutcome,
  campaignSendIssues,
  campaignStaleClaimAction,
  extractCampaignLinks,
} from '../../utils/delivery'
import { campaignsAudienceContactsPage, campaignsCheckLists, campaignsPreview, campaignsResolveUserAudience } from './campaigns-audience'
import { campaignDeliveryCounts, getCampaignOr404 } from './campaigns-campaigns'
import type { CampaignDeliveryRow, CampaignRow } from './campaigns-campaigns'
import { buildCampaignsEmail, buildCampaignsPush, buildCampaignsSms } from './campaigns-message'
import type { CampaignsMessageInput, CampaignsRecipientLinks } from './campaigns-message'

// The delivery engine. Sending a campaign makes it `scheduled` (now, or at `scheduledAt`); the `campaigns:deliver` task
// (every minute) then, per run:
//   1. starts due campaigns (`sending`): links in the content become short links (`campaign_links`);
//   2. adds the delivery rows (one per recipient and channel) in pages, resumable from `materializeCursor`;
//   3. claims up to `batchSize` queued rows (select ids, then update those still `queued`) and sends each through
//      notify; claims older than ten minutes are queued again, after three attempts they fail;
//   4. marks campaigns without queued rows `sent`, keeping their counts.

/** Who owns the short links of campaigns (`short_links.ownerModule`). */
export const CAMPAIGNS_LINK_OWNER = 'campaigns'
/** Contacts or users added per page while materializing, and pages per run. */
const MATERIALIZE_PAGE = 200
const MATERIALIZE_PAGES_PER_RUN = 25
/** D1 binds at most 100 parameters and a delivery row has 16 columns. */
const DELIVERY_INSERT_CHUNK = 6

type DeliveryInsert = typeof schema.campaignDeliveries.$inferInsert

export type CampaignsDeliverResult = { started: number, materialized: number, sent: number, skipped: number, failed: number, requeued: number, finished: number }

// --- Sending, scheduling and cancelling (the staff routes) ------------------------------------------------------------

/**
 * Checks a draft can go out and freezes what needs the request: the users of a message's audience (grant kinds need
 * it) and the site the links point at. 400 `validation_failed` with the issues, 400 `audience_not_resolved` when a
 * message reaches nobody.
 */
async function campaignsPrepareSend(event: H3Event, row: CampaignRow, now: boolean): Promise<Partial<typeof schema.campaigns.$inferInsert>> {
  const issues = campaignSendIssues(row)
  if (issues.length) throw validationError(issues)
  let recipientUserIds: string[] | null = null
  if (row.kind === 'message') recipientUserIds = await campaignsResolveUserAudience(event, row.audience)
  else {
    await campaignsCheckLists(row.audience.listIds ?? [])
    // Sent now to lists nobody is on: say so. A scheduled one may still gain subscribers.
    if (now && !(await campaignsPreview(event, row)).recipients) {
      throw apiError(400, 'audience_not_resolved', 'Nobody is subscribed to these newsletters on the chosen channels.')
    }
  }
  return { recipientUserIds, origin: authSiteOrigin(event) }
}

/**
 * Schedules a draft for `scheduledAt` (now when left out; a newsletter sent now to lists nobody is on is 400
 * `audience_not_resolved`). 409 `not_draft` when it is not a draft any more.
 */
export async function campaignsScheduleSend(event: H3Event, row: CampaignRow, sentBy: number | null, scheduledAt?: Date): Promise<CampaignRow> {
  const prepared = await campaignsPrepareSend(event, row, !scheduledAt)
  scheduledAt ??= new Date()
  const c = schema.campaigns
  await db.update(c).set({ ...prepared, status: 'scheduled', scheduledAt, sentBy, materializeCursor: null, materializedAt: null, updatedAt: new Date() })
    .where(and(eq(c.id, row.id), eq(c.status, 'draft')))
  const updated = await getCampaignOr404(row.id)
  if (updated.status !== 'scheduled') {
    throw apiError(409, 'not_draft', 'Only a draft campaign can be sent.', { status: updated.status })
  }
  return updated
}

/**
 * Stops a scheduled or sending campaign: queued deliveries are skipped (`cancelled`); ones being sent right now finish.
 * 409 `not_cancellable` for a draft, a sent or a cancelled campaign.
 */
export async function campaignsCancel(row: CampaignRow): Promise<CampaignRow> {
  if (row.status !== 'scheduled' && row.status !== 'sending') {
    throw apiError(409, 'not_cancellable', 'Only a scheduled campaign or one being sent can be cancelled.', { status: row.status })
  }
  const now = new Date()
  const c = schema.campaigns
  await db.update(c).set({ status: 'cancelled', cancelledAt: now, finishedAt: now, updatedAt: now })
    .where(and(eq(c.id, row.id), inArray(c.status, ['scheduled', 'sending'])))
  const d = schema.campaignDeliveries
  await db.update(d).set({ status: 'skipped', skipReason: 'cancelled' }).where(and(eq(d.campaignId, row.id), eq(d.status, 'queued')))
  await db.update(c).set({ counts: await campaignDeliveryCounts(row.id) }).where(eq(c.id, row.id))
  return getCampaignOr404(row.id)
}

/** Runs one deliver pass after the response (Cloudflare's `waitUntil`, Nitro's elsewhere), so a small send does not wait for the cron. */
export function campaignsDeliverSoon(event: H3Event): void {
  const promise = campaignsDeliverPass().catch((error: unknown) => console.error('[campaigns] the deliver pass after a send failed', error))
  const waitUntil = (event as { waitUntil?: (promise: Promise<unknown>) => void }).waitUntil
  if (typeof waitUntil === 'function') waitUntil.call(event, promise)
}

// --- 1. Starting: links ------------------------------------------------------------------------------------------------

/** Makes a short link (owner `campaigns` + campaign id) and a `campaign_links` row for each distinct link not made yet. */
async function campaignsCreateLinks(row: CampaignRow): Promise<void> {
  if (!row.trackClicks) return
  const urls = extractCampaignLinks(campaignLinkSources(row.content, row.channels))
  if (!urls.length) return
  const l = schema.campaignLinks
  const existing = new Set((await db.select({ url: l.url }).from(l).where(eq(l.campaignId, row.id))).map(entry => entry.url))
  const missing = urls.filter(url => !existing.has(url))
  if (!missing.length) return
  const links = await createShortLinks(missing.map(url => ({
    url,
    owner: { module: CAMPAIGNS_LINK_OWNER, refId: row.id },
    title: row.name.slice(0, 200),
    // The click is counted on the delivery (`campaign_clicks`); short-links needs no row of its own per click.
    track: false,
    createdBy: row.sentBy ?? row.createdBy ?? null,
  })))
  const rows = links.map((link, index) => ({ id: newId('cmk'), campaignId: row.id, shortLinkId: link.id, url: missing[index]!, position: urls.indexOf(missing[index]!) }))
  for (const chunk of chunkParams(rows, 15)) await db.insert(l).values(chunk).onConflictDoNothing()
}

async function campaignsStart(row: CampaignRow, now: Date): Promise<void> {
  const c = schema.campaigns
  await db.update(c).set({ status: 'sending', startedAt: now, updatedAt: now }).where(and(eq(c.id, row.id), eq(c.status, 'scheduled')))
  await campaignsCreateLinks(row)
}

// --- 2. Materializing deliveries ---------------------------------------------------------------------------------------

async function insertDeliveries(rows: DeliveryInsert[]): Promise<number> {
  for (const chunk of chunkParams(rows, DELIVERY_INSERT_CHUNK)) {
    // A run that stopped after inserting and before moving the cursor inserts the same recipients again: ignored.
    await db.insert(schema.campaignDeliveries).values(chunk).onConflictDoNothing()
  }
  return rows.length
}

/** Adds up to `pages` pages of delivery rows; sets `materializedAt` once the audience is done. */
async function campaignsMaterialize(row: CampaignRow, pages: number): Promise<number> {
  const c = schema.campaigns
  let added = 0
  let cursor = row.materializeCursor
  for (let page = 0; page < pages; page++) {
    let rows: DeliveryInsert[] = []
    let next: string | null
    if (row.kind === 'message') {
      const ids = row.recipientUserIds ?? []
      const start = Number(cursor ?? 0)
      const slice = ids.slice(start, start + MATERIALIZE_PAGE)
      rows = slice.flatMap(userId => row.channels.map(channel => ({ id: newId('cmd'), campaignId: row.id, channel, userId: Number(userId) })))
      next = slice.length ? String(start + slice.length) : null
    }
    else {
      const contacts = await campaignsAudienceContactsPage(row, cursor, MATERIALIZE_PAGE)
      for (const contact of contacts) {
        const channels = new Map<string, string>()
        for (const subscription of contact.subscriptions) if (!channels.has(subscription.channel)) channels.set(subscription.channel, subscription.id)
        for (const [channel, subscriptionId] of channels) {
          rows.push({ id: newId('cmd'), campaignId: row.id, channel: channel as CampaignSendChannel, contactId: contact.contactId, subscriptionId })
        }
      }
      next = contacts.at(-1)?.contactId ?? null
    }
    if (next === null) {
      await db.update(c).set({ materializedAt: new Date(), updatedAt: new Date() }).where(eq(c.id, row.id))
      return added
    }
    added += await insertDeliveries(rows)
    cursor = next
    await db.update(c).set({ materializeCursor: cursor, updatedAt: new Date() }).where(eq(c.id, row.id))
  }
  return added
}

// --- 3. Claiming and sending -------------------------------------------------------------------------------------------

/** Claims older than ten minutes: queued again, or `failed` after the last attempt. */
async function campaignsResetStaleClaims(now: Date): Promise<{ requeued: number, failed: number }> {
  const d = schema.campaignDeliveries
  const cutoff = new Date(now.getTime() - CAMPAIGN_CLAIM_STALE_MS)
  const stale = await db.select({ id: d.id, status: d.status, claimedAt: d.claimedAt, attempts: d.attempts })
    .from(d).where(and(eq(d.status, 'sending'), lt(d.claimedAt, cutoff))).limit(1000)
  const requeue = stale.filter(row => campaignStaleClaimAction(row, now) === 'requeue').map(row => row.id)
  const fail = stale.filter(row => campaignStaleClaimAction(row, now) === 'fail').map(row => row.id)
  for (const ids of chunkParams(requeue)) {
    await db.update(d).set({ status: 'queued', claimId: null, claimedAt: null }).where(and(inArray(d.id, ids), eq(d.status, 'sending'), lt(d.claimedAt, cutoff)))
  }
  for (const ids of chunkParams(fail)) {
    await db.update(d).set({ status: 'failed', claimId: null, error: 'Not sent after the last attempt.' }).where(and(inArray(d.id, ids), eq(d.status, 'sending'), lt(d.claimedAt, cutoff)))
  }
  return { requeued: requeue.length, failed: fail.length }
}

/**
 * Claims up to `limit` queued deliveries of sending campaigns for this pass: their ids first, then an update of those
 * still `queued` with a claim id of its own, then the rows that carry it. Two passes at once never claim the same row,
 * on either database, without relying on `RETURNING`.
 */
async function campaignsClaim(campaignIds: string[], limit: number, now: Date): Promise<CampaignDeliveryRow[]> {
  if (!campaignIds.length || limit <= 0) return []
  const d = schema.campaignDeliveries
  const candidates = await inChunks(campaignIds, ids => db.select({ id: d.id }).from(d)
    .where(and(inArray(d.campaignId, ids), eq(d.status, 'queued'))).orderBy(asc(d.id)).limit(limit))
  const ids = candidates.map(row => row.id).sort().slice(0, limit)
  if (!ids.length) return []
  const claimId = newId()
  for (const chunk of chunkParams(ids)) {
    await db.update(d).set({ status: 'sending', claimId, claimedAt: now, attempts: sql`${d.attempts} + 1` })
      .where(and(inArray(d.id, chunk), eq(d.status, 'queued')))
  }
  return inChunks(ids, chunk => db.select().from(d).where(and(inArray(d.id, chunk), eq(d.claimId, claimId))))
}

type Outcome = { status: 'sent' | 'skipped' | 'failed', skipReason?: string | null, error?: string | null }

type CampaignContext = {
  row: CampaignRow
  origin: string
  /** Short link code per URL. */
  codes: Map<string, string>
}

async function campaignContext(row: CampaignRow): Promise<CampaignContext> {
  const l = schema.campaignLinks
  const s = schema.shortLinks
  const links = await db.select({ url: l.url, code: s.code }).from(l).innerJoin(s, eq(l.shortLinkId, s.id)).where(eq(l.campaignId, row.id))
  return {
    row,
    origin: configuredAuthSiteOrigin() ?? row.origin ?? '',
    codes: new Map(links.map(link => [link.url, link.code])),
  }
}

const absolute = (origin: string, url: string) => url.startsWith('/') ? `${origin}${url}` : url

/** The links of one recipient's message, all carrying their delivery's signed token. */
async function recipientLinks(ctx: CampaignContext, delivery: CampaignDeliveryRow, locale: string): Promise<CampaignsRecipientLinks> {
  const token = await campaignsUnsubscribeToken(undefined, delivery.id)
  const { origin, row } = ctx
  return {
    link: (url) => {
      const code = ctx.codes.get(url)
      return code ? absolute(origin, shortLinkUrl({ code }, token)) : undefined
    },
    unsubscribeUrl: campaignsPageUrlAt(origin, 'unsubscribe', locale, { token }),
    oneClickUrl: `${origin}${campaignsApi.unsubscribe(token)}`,
    preferencesUrl: campaignsPageUrlAt(origin, row.kind === 'newsletter' ? 'account' : 'notifications', locale),
    pixelUrl: row.trackOpens && delivery.channel === 'email' ? `${origin}${campaignsApi.open(token)}` : null,
  }
}

const errorText = (error: unknown) => (error instanceof Error ? error.message : String(error)).slice(0, 500)

/** A newsletter delivery: to the contact's address, only while they are still subscribed to one of the campaign's lists. */
async function sendNewsletterDelivery(ctx: CampaignContext, delivery: CampaignDeliveryRow): Promise<Outcome> {
  const { row } = ctx
  const [contact] = await db.select().from(schema.campaignContacts).where(eq(schema.campaignContacts.id, delivery.contactId ?? '')).limit(1)
  const address = delivery.channel === 'email' ? contact?.email : delivery.channel === 'sms' ? contact?.phone : null
  if (!contact || !address) return { status: 'skipped', skipReason: 'unavailable' }
  const s = schema.campaignSubscriptions
  const [active] = await db.select({ id: s.id }).from(s).where(and(
    eq(s.contactId, contact.id),
    eq(s.channel, delivery.channel),
    inArray(s.listId, row.audience.listIds ?? []),
    eq(s.status, 'active'),
  )).limit(1)
  if (!active) return { status: 'skipped', skipReason: 'unsubscribed' }
  const locale = contact.locale || row.locale || 'en'
  const input: CampaignsMessageInput = { kind: row.kind, content: row.content, locale, fallbackLocale: row.locale, links: await recipientLinks(ctx, delivery, locale), meta: { campaigns: { campaignId: row.id, deliveryId: delivery.id } } }
  try {
    if (delivery.channel === 'email') await dispatchEmailNotification({ to: address, ...buildCampaignsEmail(input) })
    else await dispatchSMSNotification({ to: address, body: buildCampaignsSms(input), meta: input.meta })
    return { status: 'sent' }
  }
  catch (error) {
    return { status: 'failed', error: errorText(error) }
  }
}

/**
 * A message delivery: through `notifyUser` on `campaigns.message`, which follows the user's choices (its skip reason is
 * kept), or, for an important message, straight to the user's contacts from notify's recipient store.
 */
async function sendMessageDelivery(ctx: CampaignContext, delivery: CampaignDeliveryRow): Promise<Outcome> {
  const { row } = ctx
  const userId = delivery.userId!
  const recipient = recipientStore ? await recipientStore.findRecipient(userId) : null
  if (!recipient) return { status: 'skipped', skipReason: 'unavailable' }
  const locale = recipient.locale || row.locale || 'en'
  const input: CampaignsMessageInput = { kind: row.kind, content: row.content, locale, fallbackLocale: row.locale, links: await recipientLinks(ctx, delivery, locale), meta: { campaigns: { campaignId: row.id, deliveryId: delivery.id } } }
  const channel = delivery.channel
  try {
    if (!row.important) {
      const email = channel === 'email' ? buildCampaignsEmail(input) : undefined
      const result = await notifyUser(userId, {
        topic: CAMPAIGNS_TOPICS.message,
        ...(email ? { email: { subject: email.subject, body: email.body, text: email.text, headers: email.headers, template: email.template, meta: email.meta } } : {}),
        ...(channel === 'sms' ? { sms: { body: buildCampaignsSms(input) } } : {}),
        ...(channel === 'push' ? { push: buildCampaignsPush(input) } : {}),
      })
      return campaignNotifyOutcome(result, channel)
    }
    if (channel === 'email') {
      if (!recipient.email) return { status: 'skipped', skipReason: 'unavailable' }
      await dispatchEmailNotification({ to: recipient.email, ...buildCampaignsEmail(input) })
    }
    else if (channel === 'sms') {
      if (!recipient.phone) return { status: 'skipped', skipReason: 'unavailable' }
      await dispatchSMSNotification({ to: recipient.phone, body: buildCampaignsSms(input), meta: input.meta })
    }
    else {
      const sent = await dispatchPushNotification({ userIds: [userId], ...buildCampaignsPush(input) })
      if (sent && sent.sent === 0) return { status: 'skipped', skipReason: 'unavailable' }
    }
    return { status: 'sent' }
  }
  catch (error) {
    return { status: 'failed', error: errorText(error) }
  }
}

async function finishDelivery(delivery: CampaignDeliveryRow, outcome: Outcome): Promise<void> {
  const d = schema.campaignDeliveries
  await db.update(d).set({
    status: outcome.status,
    skipReason: outcome.skipReason ?? null,
    error: outcome.error ?? null,
    sentAt: outcome.status === 'sent' ? new Date() : null,
    claimId: null,
  }).where(and(eq(d.id, delivery.id), eq(d.claimId, delivery.claimId ?? '')))
}

// --- 4. Finishing ------------------------------------------------------------------------------------------------------

async function campaignsFinish(row: CampaignRow): Promise<boolean> {
  const d = schema.campaignDeliveries
  const [open] = await db.select({ id: d.id }).from(d).where(and(eq(d.campaignId, row.id), inArray(d.status, ['queued', 'sending']))).limit(1)
  if (open) return false
  const now = new Date()
  const c = schema.campaigns
  await db.update(c).set({ status: 'sent', finishedAt: now, counts: await campaignDeliveryCounts(row.id), updatedAt: now })
    .where(and(eq(c.id, row.id), eq(c.status, 'sending')))
  return true
}

// --- The pass ----------------------------------------------------------------------------------------------------------

/** One run of the delivery engine (the `campaigns:deliver` task, and once after "send now"). */
export async function campaignsDeliverPass(options: { now?: Date, batchSize?: number } = {}): Promise<CampaignsDeliverResult> {
  const now = options.now ?? new Date()
  const batchSize = options.batchSize ?? campaignsConfig().batchSize ?? 200
  const result: CampaignsDeliverResult = { started: 0, materialized: 0, sent: 0, skipped: 0, failed: 0, requeued: 0, finished: 0 }
  const c = schema.campaigns

  const due = await db.select().from(c).where(and(eq(c.status, 'scheduled'), isNotNull(c.scheduledAt), lte(c.scheduledAt, now)))
  for (const row of due) {
    await campaignsStart(row, now)
    result.started++
  }

  const sending = await db.select().from(c).where(eq(c.status, 'sending'))
  for (const row of sending.filter(entry => !entry.materializedAt)) {
    result.materialized += await campaignsMaterialize(row, MATERIALIZE_PAGES_PER_RUN)
  }

  const stale = await campaignsResetStaleClaims(now)
  result.requeued = stale.requeued
  result.failed += stale.failed

  const claimed = await campaignsClaim(sending.map(row => row.id), batchSize, now)
  const contexts = new Map<string, Promise<CampaignContext>>()
  for (const delivery of claimed) {
    const campaign = sending.find(row => row.id === delivery.campaignId)!
    let ctx = contexts.get(campaign.id)
    if (!ctx) contexts.set(campaign.id, ctx = campaignContext(campaign))
    let outcome: Outcome
    try {
      outcome = campaign.kind === 'newsletter' ? await sendNewsletterDelivery(await ctx, delivery) : await sendMessageDelivery(await ctx, delivery)
    }
    catch (error) {
      console.error(`[campaigns] delivery ${delivery.id} failed`, error)
      outcome = { status: 'failed', error: errorText(error) }
    }
    await finishDelivery(delivery, outcome)
    result[outcome.status]++
  }

  const fresh = await inChunks(sending.map(row => row.id), ids => db.select().from(c).where(and(inArray(c.id, ids), eq(c.status, 'sending'), isNotNull(c.materializedAt))))
  for (const row of fresh) if (await campaignsFinish(row)) result.finished++
  return result
}

// --- Retention ---------------------------------------------------------------------------------------------------------

/**
 * Deletes the delivery and click rows of campaigns that finished more than `retentionDays` ago, after storing their
 * counts on the campaign. Resolves with how many campaigns were pruned.
 */
export async function campaignsPruneDeliveries(options: { now?: Date, days?: number | false } = {}): Promise<number> {
  const days = options.days ?? campaignsConfig().retentionDays
  if (days === false || days === undefined || days === null) return 0
  const cutoff = new Date((options.now ?? new Date()).getTime() - days * 24 * 60 * 60 * 1000)
  const c = schema.campaigns
  const d = schema.campaignDeliveries
  const rows = await db.select({ id: c.id }).from(c)
    .where(and(inArray(c.status, ['sent', 'cancelled']), lt(c.finishedAt, cutoff)))
  let pruned = 0
  for (const { id } of rows) {
    const [any] = await db.select({ id: d.id }).from(d).where(eq(d.campaignId, id)).limit(1)
    if (!any) continue
    await db.update(c).set({ counts: await campaignDeliveryCounts(id) }).where(eq(c.id, id))
    await db.delete(schema.campaignClicks).where(inArray(schema.campaignClicks.deliveryId, db.select({ id: d.id }).from(d).where(eq(d.campaignId, id))))
    await db.delete(d).where(eq(d.campaignId, id))
    pruned++
  }
  return pruned
}
