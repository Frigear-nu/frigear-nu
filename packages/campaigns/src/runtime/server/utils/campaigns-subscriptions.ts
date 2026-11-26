import type { H3Event } from 'h3'
import { db, schema } from '@nuxthub/db'
import { and, eq, isNull } from 'drizzle-orm'
import { apiError, badRequest, isUniqueViolation } from '@frigear-nu/module-kit/server'
import { newId } from '@frigear-nu/module-kit/id'
import type { CampaignChannel, CampaignSubscriptionSource } from '../../../types'
import { campaignConfirmable, campaignConsentProof, campaignShouldResendConfirm, campaignSignupChannels, campaignSubscribeAction, CAMPAIGNS_DEFAULT_PAGES } from '../../utils'
import { campaignsHashToken, campaignsNewConfirmToken } from '../../utils/tokens'
import type { CampaignContactRow, CampaignListRow, CampaignSubscriptionRow } from './campaigns-dto'

// Signing up, confirming and unsubscribing. Every public answer is the same whether an address was known or not.

export type CampaignsSignup = {
  email?: string
  phone?: string
  name?: string
  locale?: string
  /** The channels asked for; all the list offers when left out. Only channels with an address count. */
  channels?: CampaignChannel[]
}

export async function findCampaignContactByEmail(email: string): Promise<CampaignContactRow | undefined> {
  const [row] = await db.select().from(schema.campaignContacts).where(eq(schema.campaignContacts.email, email)).limit(1)
  return row
}

export async function findCampaignContactByPhone(phone: string): Promise<CampaignContactRow | undefined> {
  const [row] = await db.select().from(schema.campaignContacts).where(eq(schema.campaignContacts.phone, phone)).limit(1)
  return row
}

export async function findCampaignContactByUser(userId: number): Promise<CampaignContactRow | undefined> {
  const [row] = await db.select().from(schema.campaignContacts).where(eq(schema.campaignContacts.userId, userId)).limit(1)
  return row
}

async function insertCampaignContact(values: { email: string | null, phone: string | null, name: string | null, locale: string | null, userId?: number | null }): Promise<CampaignContactRow | undefined> {
  const id = newId('cmc')
  try {
    await db.insert(schema.campaignContacts).values({ id, ...values })
  }
  catch (error) {
    // Another request created a contact with the address first.
    if (isUniqueViolation(error)) return undefined
    throw error
  }
  const [row] = await db.select().from(schema.campaignContacts).where(eq(schema.campaignContacts.id, id)).limit(1)
  return row
}

/**
 * The contact of each channel of a signup. An existing contact is used as it is and never changed by an anonymous
 * request (its name and language stay); addresses nobody has yet go on one new contact.
 */
async function campaignsSignupContacts(signup: CampaignsSignup, channels: CampaignChannel[]): Promise<Map<CampaignChannel, CampaignContactRow>> {
  const contacts = new Map<CampaignChannel, CampaignContactRow>()
  const lookup = async () => {
    if (channels.includes('email') && signup.email && !contacts.has('email')) {
      const row = await findCampaignContactByEmail(signup.email)
      if (row) contacts.set('email', row)
    }
    if (channels.includes('sms') && signup.phone && !contacts.has('sms')) {
      const row = await findCampaignContactByPhone(signup.phone)
      if (row) contacts.set('sms', row)
    }
  }
  await lookup()
  const missing = channels.filter(channel => !contacts.has(channel))
  if (missing.length) {
    const created = await insertCampaignContact({
      email: missing.includes('email') ? signup.email ?? null : null,
      phone: missing.includes('sms') ? signup.phone ?? null : null,
      name: signup.name ?? null,
      locale: signup.locale ?? null,
    })
    if (created) for (const channel of missing) contacts.set(channel, created)
    else await lookup()
  }
  return contacts
}

export async function findCampaignSubscription(listId: string, contactId: string, channel: CampaignChannel): Promise<CampaignSubscriptionRow | undefined> {
  const s = schema.campaignSubscriptions
  const [row] = await db.select().from(s).where(and(eq(s.listId, listId), eq(s.contactId, contactId), eq(s.channel, channel))).limit(1)
  return row
}

export async function findCampaignSubscriptionById(id: string): Promise<CampaignSubscriptionRow | undefined> {
  const [row] = await db.select().from(schema.campaignSubscriptions).where(eq(schema.campaignSubscriptions.id, id)).limit(1)
  return row
}

export type CampaignsSubscribeOptions = {
  source: CampaignSubscriptionSource
  /** `false` when the address is proven already (a signed-in user's verified email); the list's double opt-in otherwise. */
  confirm?: boolean
  /** The language of the confirmation; the contact's, else English. */
  locale?: string | null
  name?: string | null
}

/**
 * Signs one contact up for a list on one channel: a new subscription, or a pending or unsubscribed one renewed with
 * the new consent. An active one stays as it is. With double opt-in the subscription is `pending` and the confirmation
 * goes out (again only after `resendAfterSeconds`); without, it is `active` at once.
 */
export async function campaignsSubscribeContact(event: H3Event, list: CampaignListRow, contact: CampaignContactRow, channel: CampaignChannel, options: CampaignsSubscribeOptions): Promise<CampaignSubscriptionRow | undefined> {
  const config = campaignsConfig(event)
  const now = new Date()
  const existing = await findCampaignSubscription(list.id, contact.id, channel)
  const action = campaignSubscribeAction(existing?.status)
  if (action === 'keep') return existing
  const confirm = options.confirm ?? list.doubleOptIn
  if (confirm && existing && !campaignShouldResendConfirm(existing, now, config.resendAfterSeconds)) return existing

  const token = confirm ? await campaignsNewConfirmToken() : null
  const proof = campaignConsentProof({
    source: options.source,
    consentVersion: list.consentVersion,
    confirm,
    confirmTokenHash: token?.hash ?? null,
    confirmTtlHours: config.confirmTtlHours,
    ipHash: await campaignsIpHash(event),
    now,
  })

  let id = existing?.id
  if (existing) {
    await db.update(schema.campaignSubscriptions).set({ ...proof, updatedAt: now }).where(eq(schema.campaignSubscriptions.id, existing.id))
  }
  else {
    id = newId('cms')
    try {
      await db.insert(schema.campaignSubscriptions).values({ id, listId: list.id, contactId: contact.id, channel, ...proof })
    }
    catch (error) {
      // The same signup twice at once: the first one wins and sends the confirmation.
      if (isUniqueViolation(error)) return findCampaignSubscription(list.id, contact.id, channel)
      throw error
    }
  }

  const address = channel === 'email' ? contact.email : contact.phone
  if (token && address && id) {
    const locale = options.locale ?? contact.locale
    const confirmUrl = campaignsPageUrl(event, 'confirm', locale, { token: token.token })
      ?? `${configuredAuthSiteOrigin(event) ?? getRequestURL(event).origin}${CAMPAIGNS_DEFAULT_PAGES.confirm}?token=${encodeURIComponent(token.token)}`
    const unsubscribeUrl = campaignsPageUrl(event, 'unsubscribe', locale, { token: await campaignsUnsubscribeToken(event, id) })
    await campaignsSendConfirm({
      channel,
      to: address,
      name: options.name ?? contact.name,
      locale,
      listName: list.name,
      confirmUrl,
      unsubscribeUrl,
      ttlHours: config.confirmTtlHours,
    })
  }
  return findCampaignSubscriptionById(id!)
}

/**
 * The public signup: the contacts of the addresses given, and a subscription per channel. Answers nothing about them,
 * so a known address and an unknown one look the same to the caller.
 */
export async function campaignsSignup(event: H3Event, list: CampaignListRow, signup: CampaignsSignup, source: CampaignSubscriptionSource): Promise<void> {
  const channels = campaignSignupChannels(list, signup)
  if (!channels.length) {
    throw badRequest(list.channels.includes('email')
      ? 'Give an email address to sign up for this newsletter.'
      : 'Give a phone number to sign up for this newsletter.', { channels: list.channels })
  }
  // The signing key must exist before anything is written: the confirmation carries an unsubscribe link.
  await campaignsRequireSigningKey(event)
  const contacts = await campaignsSignupContacts(signup, channels)
  for (const channel of channels) {
    const contact = contacts.get(channel)
    if (contact) await campaignsSubscribeContact(event, list, contact, channel, { source, locale: signup.locale ?? null, name: signup.name ?? null })
  }
}

/** Confirms the subscription of a confirmation token: 400 `invalid_token` when unknown or used, 410 `token_expired`. */
export async function campaignsConfirm(token: string): Promise<CampaignSubscriptionRow> {
  const s = schema.campaignSubscriptions
  const [row] = await db.select().from(s).where(eq(s.confirmTokenHash, await campaignsHashToken(token))).limit(1)
  if (!row) throw apiError(400, 'invalid_token', 'This confirmation link is not valid, or it was already used.')
  const now = new Date()
  if (!campaignConfirmable(row, now)) throw apiError(410, 'token_expired', 'This confirmation link has expired. Sign up again to get a new one.')
  await db.update(s).set({ status: 'active', confirmedAt: now, confirmTokenHash: null, confirmExpiresAt: null, updatedAt: now })
    .where(and(eq(s.id, row.id), eq(s.status, 'pending')))
  return (await findCampaignSubscriptionById(row.id))!
}

/** Unsubscribes a subscription (again: no change). Clears a confirmation still waiting, so its link stops working. */
export async function campaignsUnsubscribe(subscription: CampaignSubscriptionRow): Promise<CampaignSubscriptionRow> {
  if (subscription.status === 'unsubscribed') return subscription
  const now = new Date()
  await db.update(schema.campaignSubscriptions)
    .set({ status: 'unsubscribed', unsubscribedAt: now, confirmTokenHash: null, confirmExpiresAt: null, updatedAt: now })
    .where(eq(schema.campaignSubscriptions.id, subscription.id))
  return (await findCampaignSubscriptionById(subscription.id))!
}

/**
 * The contact of a signed-in user: the one linked to them, else the one with their email address once it is verified
 * (which links it now). `undefined` when they have none.
 */
export async function campaignsUserContact(user: { id: number, email: string, emailVerified: boolean }): Promise<CampaignContactRow | undefined> {
  const linked = await findCampaignContactByUser(user.id)
  if (linked || !user.emailVerified) return linked
  const email = user.email.trim().toLowerCase()
  const c = schema.campaignContacts
  await db.update(c).set({ userId: user.id, updatedAt: new Date() }).where(and(eq(c.email, email), isNull(c.userId)))
  return findCampaignContactByUser(user.id)
}
