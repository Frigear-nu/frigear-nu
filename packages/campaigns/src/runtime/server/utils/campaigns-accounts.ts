import type { H3Event } from 'h3'
import { db, schema } from '@nuxthub/db'
import { and, asc, eq, gt, inArray } from 'drizzle-orm'
import { apiError, chunkParams, inChunks, isUniqueViolation } from '@frigear-nu/module-kit/server'
import { newId } from '@frigear-nu/module-kit/id'
import { campaignConsentProof } from '../../utils'
import { campaignRegisterExtras } from '../../utils/schemas'
import type { CampaignContactRow, CampaignListRow } from './campaigns-dto'

// Lists and accounts (`signupMode`): the lists the registration form offers, adding a new account to the `auto` lists
// and to the `offer` lists it ticked (`auth:user:created`), and "Add all current accounts" of an `auto` list. Accounts
// are reached on email only: the account's address is the one they signed up with, while a phone number on a user was
// never confirmed by them.

/** An account as these flows need it. */
export type CampaignsAccount = { id: number, email: string, name: string | null, locale: string | null, emailVerified: boolean }

/** A stored user (auth's `AuthStoredUser`, or a `users` row) as an account. */
export function campaignsAccountOf(user: { id: number | string, email?: unknown, name?: unknown, locale?: unknown, emailVerifiedAt?: unknown }): CampaignsAccount | null {
  if (typeof user.email !== 'string' || !user.email.trim()) return null
  return {
    id: Number(user.id),
    email: user.email.trim().toLowerCase(),
    name: typeof user.name === 'string' && user.name ? user.name : null,
    locale: typeof user.locale === 'string' && user.locale ? user.locale : null,
    emailVerified: !!user.emailVerifiedAt,
  }
}

/** The lists the registration form offers: public, `signupMode: 'offer'`, on email; oldest first. */
export async function campaignsSignupLists(): Promise<CampaignListRow[]> {
  const l = schema.campaignLists
  const rows = await db.select().from(l).where(and(eq(l.signupMode, 'offer'), eq(l.public, true))).orderBy(asc(l.createdAt), asc(l.id))
  return rows.filter(list => list.channels.includes('email'))
}

/**
 * The account's contact: the one linked to the user, else the one with their address (linked to them only when the
 * address is verified), else a new one linked to them.
 */
async function campaignsAccountContact(account: CampaignsAccount): Promise<CampaignContactRow | undefined> {
  const linked = await campaignsUserContact({ id: account.id, email: account.email, emailVerified: account.emailVerified })
  if (linked?.email) return linked
  const byEmail = await findCampaignContactByEmail(account.email)
  if (byEmail) return byEmail
  const c = schema.campaignContacts
  try {
    if (linked) await db.update(c).set({ email: account.email, updatedAt: new Date() }).where(eq(c.id, linked.id))
    else await db.insert(c).values({ id: newId('cmc'), email: account.email, phone: null, userId: account.id, name: account.name, locale: account.locale })
  }
  catch (error) {
    // Someone else took the address in the meantime: their contact is the one with it.
    if (!isUniqueViolation(error)) throw error
  }
  return findCampaignContactByEmail(account.email)
}

/**
 * Puts an account on a list (email). Never again after they unsubscribed, nothing for an active subscription. With the
 * list's double opt-in and an address not verified yet the subscription waits for the confirmation email (sent as the
 * signup sends it, so only within a request); otherwise it is active at once. Answers whether it was added.
 */
async function campaignsSubscribeAccount(event: H3Event | undefined, list: CampaignListRow, contact: CampaignContactRow, account: CampaignsAccount): Promise<boolean> {
  const existing = await findCampaignSubscription(list.id, contact.id, 'email')
  if (existing && existing.status !== 'pending') return false
  const confirm = list.doubleOptIn && !account.emailVerified
  if (confirm || event) {
    if (!event) return false
    await campaignsSubscribeContact(event, list, contact, 'email', { source: 'account', confirm, locale: account.locale, name: account.name })
    return true
  }
  const now = new Date()
  const proof = campaignConsentProof({ source: 'account', consentVersion: list.consentVersion, confirm: false, confirmTokenHash: null, confirmTtlHours: 0, ipHash: null, now })
  const s = schema.campaignSubscriptions
  if (existing) {
    await db.update(s).set({ ...proof, updatedAt: now }).where(eq(s.id, existing.id))
    return true
  }
  try {
    await db.insert(s).values({ id: newId('cms'), listId: list.id, contactId: contact.id, channel: 'email', ...proof })
  }
  catch (error) {
    if (isUniqueViolation(error)) return false
    throw error
  }
  return true
}

/**
 * A new account (`auth:user:created`): on every `auto` list, and on the offered lists it ticked on the registration
 * form (`extras.campaigns.listIds`; ids of lists that are not offered are ignored). Consent source `account`, with each
 * list's current consent version.
 */
export async function campaignsAddNewAccount(event: H3Event | undefined, user: Parameters<typeof campaignsAccountOf>[0], extras: unknown): Promise<void> {
  const account = campaignsAccountOf(user)
  if (!account) return
  const parsed = campaignRegisterExtras.safeParse(extras ?? {})
  const ticked = new Set(parsed.success ? parsed.data.listIds : [])
  const l = schema.campaignLists
  const lists = (await db.select().from(l).where(inArray(l.signupMode, ['auto', 'offer'])).orderBy(asc(l.createdAt), asc(l.id)))
    .filter(list => list.channels.includes('email') && (list.signupMode === 'auto' || (list.public && ticked.has(list.id))))
  if (!lists.length) return
  // The confirmation emails carry an unsubscribe link: without a signing key nothing is written.
  if (lists.some(list => list.doubleOptIn && !account.emailVerified)) await campaignsRequireSigningKey(event)
  const contact = await campaignsAccountContact(account)
  if (!contact) return
  for (const list of lists) await campaignsSubscribeAccount(event, list, contact, account)
}

// --- "Add all current accounts" ----------------------------------------------------------------------------------------

const ACCOUNT_PAGE = 500

/** Only a list that adds new accounts automatically can add every account: 409 `signup_mode` otherwise. */
export function campaignsAssertAutoList(list: CampaignListRow): void {
  if (list.signupMode !== 'auto') {
    throw apiError(409, 'signup_mode', 'Only a list that adds new accounts automatically can add every current account.')
  }
  if (!list.channels.includes('email')) {
    throw apiError(409, 'signup_mode', 'Accounts are added on email, which this list does not use.')
  }
}

/**
 * The accounts of one page that "Add all current accounts" would add: not on the list yet in any status (so nobody who
 * unsubscribed comes back), and with the list's double opt-in only those whose address is verified (nobody gets a
 * confirmation email from a staff action).
 */
async function campaignsAccountsToAdd(list: CampaignListRow, accounts: CampaignsAccount[]): Promise<Array<{ account: CampaignsAccount, contact: CampaignContactRow | undefined }>> {
  const eligible = accounts.filter(account => !list.doubleOptIn || account.emailVerified)
  if (!eligible.length) return []
  const c = schema.campaignContacts
  const linked = await inChunks(eligible.map(account => account.id), ids => db.select().from(c).where(inArray(c.userId, ids)))
  const byUser = new Map(linked.filter(contact => contact.email).map(contact => [contact.userId!, contact]))
  const byEmailRows = await inChunks(eligible.filter(account => !byUser.has(account.id)).map(account => account.email), emails => db.select().from(c).where(inArray(c.email, emails)))
  const byEmail = new Map(byEmailRows.map(contact => [contact.email!, contact]))
  const planned = eligible.map(account => ({ account, contact: byUser.get(account.id) ?? byEmail.get(account.email) }))

  const s = schema.campaignSubscriptions
  const contactIds = [...new Set(planned.flatMap(entry => entry.contact ? [entry.contact.id] : []))]
  const subscribed = new Set((await inChunks(contactIds, ids => db.select({ contactId: s.contactId }).from(s)
    .where(and(eq(s.listId, list.id), eq(s.channel, 'email'), inArray(s.contactId, ids))))).map(row => row.contactId))
  return planned.filter(entry => !entry.contact || !subscribed.has(entry.contact.id))
}

/** Every account, a page at a time, in id order. */
async function* campaignsAccountPages(): AsyncGenerator<CampaignsAccount[]> {
  const u = schema.users
  let after = 0
  for (;;) {
    const rows = await db.select().from(u).where(gt(u.id, after)).orderBy(asc(u.id)).limit(ACCOUNT_PAGE)
    if (!rows.length) return
    after = rows.at(-1)!.id
    yield rows.flatMap((row) => {
      const account = campaignsAccountOf(row as typeof row & { emailVerifiedAt?: unknown })
      return account ? [account] : []
    })
    if (rows.length < ACCOUNT_PAGE) return
  }
}

/** How many accounts "Add all current accounts" would add to the list now. */
export async function campaignsCountAccountsToAdd(list: CampaignListRow): Promise<number> {
  let total = 0
  for await (const page of campaignsAccountPages()) total += (await campaignsAccountsToAdd(list, page)).length
  return total
}

// Rows per insert, under D1's 100 bound parameters: 8 columns of a contact, 15 of a subscription.
const CONTACT_ROWS = 10
const SUBSCRIPTION_ROWS = 6

/**
 * "Add all current accounts": every account not on the list yet becomes an active subscriber (consent source `admin`,
 * the list's current consent version), in chunks. Answers how many were added.
 */
export async function campaignsAddAllAccounts(list: CampaignListRow): Promise<number> {
  let added = 0
  for await (const page of campaignsAccountPages()) {
    const planned = await campaignsAccountsToAdd(list, page)
    if (!planned.length) continue

    // New contacts for the accounts that have none, linked to them.
    const missing = planned.filter(entry => !entry.contact)
    const c = schema.campaignContacts
    for (const chunk of chunkParams(missing, CONTACT_ROWS)) {
      const values = chunk.map(({ account }) => ({ id: newId('cmc'), email: account.email, phone: null, userId: account.id, name: account.name, locale: account.locale }))
      try {
        await db.insert(c).values(values)
      }
      catch (error) {
        if (!isUniqueViolation(error)) throw error
        // One of them got a contact meanwhile: one at a time, keeping the ones that exist.
        for (const value of values) await db.insert(c).values(value).catch((cause: unknown) => {
          if (!isUniqueViolation(cause)) throw cause
        })
      }
    }
    if (missing.length) {
      const created = await inChunks(missing.map(entry => entry.account.email), emails => db.select().from(c).where(inArray(c.email, emails)))
      const byEmail = new Map(created.map(contact => [contact.email!, contact]))
      for (const entry of missing) entry.contact = byEmail.get(entry.account.email)
    }

    const now = new Date()
    const proof = campaignConsentProof({ source: 'admin', consentVersion: list.consentVersion, confirm: false, confirmTokenHash: null, confirmTtlHours: 0, ipHash: null, now })
    const contactIds = [...new Set(planned.flatMap(entry => entry.contact ? [entry.contact.id] : []))]
    const s = schema.campaignSubscriptions
    for (const chunk of chunkParams(contactIds, SUBSCRIPTION_ROWS)) {
      const values = chunk.map(contactId => ({ id: newId('cms'), listId: list.id, contactId, channel: 'email' as const, ...proof }))
      try {
        await db.insert(s).values(values)
        added += values.length
      }
      catch (error) {
        if (!isUniqueViolation(error)) throw error
        for (const value of values) {
          try {
            await db.insert(s).values(value)
            added++
          }
          catch (cause) {
            if (!isUniqueViolation(cause)) throw cause
          }
        }
      }
    }
  }
  return added
}
