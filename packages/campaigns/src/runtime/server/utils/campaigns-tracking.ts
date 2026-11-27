import type { H3Event } from 'h3'
import { db, schema } from '@nuxthub/db'
import { and, eq, inArray, isNull, sql } from 'drizzle-orm'
import { apiError, notFound } from '@frigear-nu/module-kit/server'
import type { CampaignSendChannel, CampaignUnsubscribeResultDto } from '../../../types'
import { CAMPAIGNS_TOPICS } from '../../notifications'
import { campaignTokenKind } from '../../utils/tokens'
import type { CampaignDeliveryRow } from './campaigns-campaigns'
import { findCampaign } from './campaigns-campaigns'

// What the token of a campaign message (a signed delivery id) does: attribute a click of one of the campaign's short
// links, mark the email opened (with `trackOpens`), and unsubscribe.

/** The delivery a token was signed for, or `null` when it is not a valid delivery token or the row is gone. */
export async function campaignsDeliveryFromToken(event: H3Event | undefined, token: string | null | undefined): Promise<CampaignDeliveryRow | null> {
  if (!token) return null
  const subject = await campaignsVerifyUnsubscribeToken(event, token)
  if (campaignTokenKind(subject) !== 'delivery') return null
  const [row] = await db.select().from(schema.campaignDeliveries).where(eq(schema.campaignDeliveries.id, subject!)).limit(1)
  return row ?? null
}

/**
 * A click on a campaign's short link (the `short-links:clicked` hook): when the subject is a delivery of that campaign,
 * counts it on the delivery and adds a `campaign_clicks` row. Anything else is ignored.
 */
export async function campaignsRecordClick(link: { id: string, owner: { module: string, refId?: string | null } }, subject: string | null): Promise<void> {
  if (link.owner.module !== CAMPAIGNS_LINK_OWNER || !subject) return
  const delivery = await campaignsDeliveryFromToken(undefined, subject)
  if (!delivery || delivery.campaignId !== link.owner.refId) return
  const [campaignLink] = await db.select({ id: schema.campaignLinks.id }).from(schema.campaignLinks)
    .where(and(eq(schema.campaignLinks.shortLinkId, link.id), eq(schema.campaignLinks.campaignId, delivery.campaignId))).limit(1)
  if (!campaignLink) return
  const now = new Date()
  const d = schema.campaignDeliveries
  await db.update(d).set({ clicks: sql`${d.clicks} + 1` }).where(eq(d.id, delivery.id))
  await db.update(d).set({ clickedAt: now }).where(and(eq(d.id, delivery.id), isNull(d.clickedAt)))
  await db.insert(schema.campaignClicks).values({ deliveryId: delivery.id, linkId: campaignLink.id, at: now })
}

/** Marks a delivery's email opened, once, when its campaign has `trackOpens`. Never throws for a bad token. */
export async function campaignsRecordOpen(event: H3Event, token: string): Promise<void> {
  const delivery = await campaignsDeliveryFromToken(event, token)
  if (!delivery || delivery.openedAt) return
  const campaign = await findCampaign(delivery.campaignId)
  if (!campaign?.trackOpens) return
  const d = schema.campaignDeliveries
  await db.update(d).set({ openedAt: new Date() }).where(and(eq(d.id, delivery.id), isNull(d.openedAt)))
}

/**
 * Unsubscribes the recipient of a campaign message. To lists: the contact's subscriptions on the delivery's channel
 * to every list the campaign went to. A message to a user: their `campaigns.message` choice for the channel is turned off
 * (notify's choices store, `@frigear-nu/preferences`; 501 `not_configured` without one).
 */
export async function campaignsUnsubscribeDelivery(event: H3Event, delivery: CampaignDeliveryRow): Promise<CampaignUnsubscribeResultDto> {
  const campaign = await findCampaign(delivery.campaignId)
  if (!campaign) throw notFound('This message no longer exists.')
  if (campaign.kind === 'message') {
    if (!delivery.userId) throw notFound('This message no longer exists.')
    try {
      await saveNotificationChannels(delivery.userId, { [CAMPAIGNS_TOPICS.message]: { [delivery.channel]: false } })
    }
    catch (error) {
      console.error('[campaigns] could not store the unsubscribe of a message', error)
      throw apiError(501, 'not_configured', 'Notification choices cannot be stored here: manage them in your account.')
    }
    return { topic: CAMPAIGNS_TOPICS.message, channel: delivery.channel as CampaignSendChannel, status: 'unsubscribed' }
  }
  const s = schema.campaignSubscriptions
  const listIds = campaign.audience.listIds ?? []
  const subscriptions = delivery.contactId && listIds.length
    ? await db.select().from(s).where(and(eq(s.contactId, delivery.contactId), eq(s.channel, delivery.channel), inArray(s.listId, listIds)))
    : []
  if (!subscriptions.length) throw notFound('This subscription no longer exists.')
  const updated = []
  for (const subscription of subscriptions) updated.push(await campaignsUnsubscribe(subscription))
  // The subscription the message went out for answers (the first one when it is gone).
  const main = updated.find(row => row.id === delivery.subscriptionId) ?? updated[0]!
  return toCampaignSubscriptionResultDto(main, await getCampaignListOr404(main.listId))
}
