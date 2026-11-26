import type { H3Event } from 'h3'
import { db, schema } from '@nuxthub/db'
import { eq, inArray, or } from 'drizzle-orm'
import { apiError, inChunks, isUniqueViolation, validationError } from '@frigear-nu/module-kit/server'
import { newId } from '@frigear-nu/module-kit/id'
import type { CampaignChannel, CampaignMyListDto, CampaignMySubscriptionsDto, CampaignSubscriptionStatus } from '../../../types'
import type { CampaignContactRow } from './campaigns-dto'

// The signed-in user's newsletters (`/api/campaigns/me/subscriptions`). Their contact is linked to them by their verified
// email address; a list they turn on from the account page is active at once when that address is verified, and
// waits for the confirmation email otherwise.

export type CampaignsMe = { id: number, email: string, name: string, locale: string | null, emailVerified: boolean }

/** The signed-in user as the newsletters page needs them: address, name, language and whether the address is verified. */
export async function campaignsLoadMe(userId: number): Promise<CampaignsMe> {
  const [row] = await db.select().from(schema.users).where(eq(schema.users.id, userId)).limit(1)
  if (!row) throw apiError(401, 'unauthorized', 'Sign in to see your newsletters.')
  const verifiedAt = (row as { emailVerifiedAt?: unknown }).emailVerifiedAt
  return { id: row.id, email: row.email, name: row.name, locale: row.locale ?? null, emailVerified: !!verifiedAt }
}

/** The public lists, and the others the user is on, with the user's subscription per channel. */
export async function campaignsMySubscriptions(me: CampaignsMe): Promise<CampaignMySubscriptionsDto> {
  const contact = await campaignsUserContact(me)
  const s = schema.campaignSubscriptions
  const subscriptions = contact ? await db.select().from(s).where(eq(s.contactId, contact.id)) : []
  const subscribedListIds = [...new Set(subscriptions.map(row => row.listId))]
  const l = schema.campaignLists
  const lists = subscribedListIds.length
    ? await inChunks(subscribedListIds, ids => db.select().from(l).where(or(eq(l.public, true), inArray(l.id, ids))))
    : await db.select().from(l).where(eq(l.public, true))
  const unique = [...new Map(lists.map(list => [list.id, list])).values()]
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime() || a.id.localeCompare(b.id))
  return {
    emailVerified: me.emailVerified,
    lists: unique.map((list): CampaignMyListDto => ({
      id: list.id,
      slug: list.slug,
      name: list.name,
      description: list.description ?? null,
      channels: list.channels,
      consentText: list.consentText ?? null,
      subscriptions: Object.fromEntries(subscriptions
        .filter(row => row.listId === list.id)
        .map(row => [row.channel, row.status])) as Partial<Record<CampaignChannel, CampaignSubscriptionStatus>>,
    })),
  }
}

/** The user's contact for email: the linked one (given their address when it has none), or a new one. */
async function campaignsMyEmailContact(me: CampaignsMe): Promise<CampaignContactRow> {
  const email = me.email.trim().toLowerCase()
  const contact = await campaignsUserContact(me)
  if (contact?.email) return contact
  const taken = await findCampaignContactByEmail(email)
  // Somebody signed this address up before the user verified it: only a verified address may claim that contact.
  if (taken) throw apiError(409, 'email_unverified', 'Verify your email address first, then sign up again.')
  if (contact) {
    try {
      await db.update(schema.campaignContacts).set({ email, updatedAt: new Date() }).where(eq(schema.campaignContacts.id, contact.id))
    }
    catch (error) {
      if (isUniqueViolation(error)) throw apiError(409, 'email_unverified', 'Verify your email address first, then sign up again.')
      throw error
    }
    return { ...contact, email }
  }
  const id = newId('cmc')
  try {
    await db.insert(schema.campaignContacts).values({ id, email, phone: null, userId: me.id, name: me.name, locale: me.locale })
  }
  catch (error) {
    if (isUniqueViolation(error)) throw apiError(409, 'email_unverified', 'Verify your email address first, then sign up again.')
    throw error
  }
  return (await findCampaignContactByUser(me.id))!
}

/**
 * Applies the account page's changes: per list, channels turned on or off. Turning on is the email channel only (an SMS
 * signup needs a phone number confirmed by the signup form); turning off works on every channel. A list must be public
 * or one the user is on.
 */
export async function campaignsUpdateMySubscriptions(event: H3Event, me: CampaignsMe, changes: Record<string, Partial<Record<CampaignChannel, boolean>>>): Promise<CampaignMySubscriptionsDto> {
  const ids = Object.keys(changes)
  const contact = await campaignsUserContact(me)
  const s = schema.campaignSubscriptions
  const mine = contact ? await db.select().from(s).where(eq(s.contactId, contact.id)) : []
  const lists = ids.length ? await inChunks(ids, part => db.select().from(schema.campaignLists).where(inArray(schema.campaignLists.id, part))) : []
  const byId = new Map(lists.map(list => [list.id, list]))

  const issues: Array<{ code: 'custom', path: string[], message: string }> = []
  for (const id of ids) {
    const list = byId.get(id)
    if (!list || (!list.public && !mine.some(row => row.listId === id))) {
      issues.push({ code: 'custom', path: ['lists', id], message: 'Unknown newsletter.' })
      continue
    }
    for (const [channel, on] of Object.entries(changes[id]!) as Array<[CampaignChannel, boolean]>) {
      if (on && channel === 'sms') issues.push({ code: 'custom', path: ['lists', id, channel], message: 'Sign up for SMS with the signup form, which confirms your phone number.' })
      else if (on && !list.channels.includes(channel)) issues.push({ code: 'custom', path: ['lists', id, channel], message: 'This newsletter is not sent on this channel.' })
    }
  }
  if (issues.length) throw validationError(issues)

  for (const id of ids) {
    const list = byId.get(id)!
    for (const [channel, on] of Object.entries(changes[id]!) as Array<[CampaignChannel, boolean]>) {
      if (on) {
        const emailContact = await campaignsMyEmailContact(me)
        await campaignsSubscribeContact(event, list, emailContact, 'email', { source: 'account', confirm: !me.emailVerified, locale: me.locale, name: me.name })
      }
      else {
        const row = mine.find(entry => entry.listId === id && entry.channel === channel)
        if (row) await campaignsUnsubscribe(row)
      }
    }
  }
  return campaignsMySubscriptions(me)
}
