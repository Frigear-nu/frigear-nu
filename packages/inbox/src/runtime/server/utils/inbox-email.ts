import type { H3Event } from 'h3'
import { db, schema } from '@nuxthub/db'
import { and, desc, eq, like } from 'drizzle-orm'
import { emailRecipients, emailToInbound } from '../../utils/payloads'
import type { InboxEmailPayload } from '../../utils/payloads'
import { isOnInboxDomain, normaliseMessageId, parseInboxDomains, routeEmailRecipient } from '../../utils/email-routing'
import type { InboxRecipientRoute } from '../../utils/email-routing'
import type { InboxAttachment } from '../../../types'
import type { InboxChannelAccountRow } from './inbox-dto'

// Inbound email, shared by every inbound email driver: recipient routing and storing an email for every mailbox it
// reaches. Outbound helpers (reply addresses, From, threading headers) are in `inbox-channels.ts`.

/** The inbox domains (`inbox.email.domains`, `NUXT_INBOX_DOMAINS`), read per request so the environment applies. */
export function inboxDomains(event?: H3Event): string[] {
  return parseInboxDomains(inboxConfig(event).domains)
}

/** Whether an address is on one of the inbox domains. */
export function inboxIsOnDomain(address: string | null | undefined, event?: H3Event): boolean {
  return isOnInboxDomain(address, inboxDomains(event))
}

/**
 * Where an email to `address` goes: the email account with exactly that address; for `local+<threadId>@domain` the
 * account at `local@domain` and the thread as a hint; `unknown` for any other address on an inbox domain (a driver
 * that can bounces it); `foreign` otherwise.
 */
export function inboxRouteRecipient(address: string, event?: H3Event): Promise<InboxRecipientRoute<InboxChannelAccountRow>> {
  return routeEmailRecipient(address, inboxDomains(event), found => inboxFindAccount('email', { address: found }))
}

export type InboxEmailDelivery
  = | { status: 'received', mailboxId: string, threadId: string, messageId: string }
    | { status: 'duplicate', mailboxId: string, messageId: string }
    | { status: 'ignored', mailboxId?: string, reason: string }

type WithoutMailbox<T> = T extends unknown ? Omit<T, 'mailboxId'> : never

/** What `inboxIngestEmail` did: the answer for the provider, and the recipients on an inbox domain nobody has. */
export type InboxEmailIngestResult = {
  /** The first account's delivery, with `deliveries` listing each (with its `mailboxId`) when there was more than one. */
  response: WithoutMailbox<InboxEmailDelivery> & { deliveries?: InboxEmailDelivery[] }
  deliveries: InboxEmailDelivery[]
  unknown: string[]
}

/**
 * Stores an inbound email for every mailbox it reaches. The recipients are routed with `inboxRouteRecipient`: `To` and
 * `Cc` of the payload, or `recipients` (the envelope, for a driver that gets one message per recipient). An account is
 * reached once, however many of its addresses the email names; a plus address adds its thread as a hint. `attachments`
 * replaces the payload's (files the driver stored itself). Unroutable mail answers `ignored`/`no_account`.
 */
export async function inboxIngestEmail(event: H3Event, payload: InboxEmailPayload, options: { recipients?: string[], attachments?: InboxAttachment[] } = {}): Promise<InboxEmailIngestResult> {
  const accounts = new Map<string, { account: InboxChannelAccountRow, threadHint: string | null }>()
  const unknown: string[] = []
  for (const recipient of options.recipients ?? emailRecipients(payload)) {
    const route = await inboxRouteRecipient(recipient, event)
    if (route.kind === 'unknown') unknown.push(recipient)
    if (route.kind !== 'account') continue
    const known = accounts.get(route.account.id)
    if (!known) accounts.set(route.account.id, { account: route.account, threadHint: route.threadId })
    else if (!known.threadHint && route.threadId) known.threadHint = route.threadId
  }
  if (!accounts.size) return { response: { status: 'ignored', reason: 'no_account' }, deliveries: [], unknown }

  const deliveries: InboxEmailDelivery[] = []
  for (const { account, threadHint } of accounts.values()) {
    const inbound = emailToInbound(payload, account.address, threadHint)
    if (options.attachments) inbound.attachments = options.attachments
    const result = await inboxReceive(event, 'email', inbound, account)
    if (result.status === 'received') deliveries.push({ status: 'received', mailboxId: account.mailboxId, threadId: result.thread.id, messageId: result.message.id })
    else if (result.status === 'duplicate') deliveries.push({ status: 'duplicate', mailboxId: account.mailboxId, messageId: result.messageId })
    else deliveries.push({ status: 'ignored', mailboxId: account.mailboxId, reason: result.reason })
  }
  const { mailboxId: _mailboxId, ...rest } = deliveries[0]!
  const first = rest as WithoutMailbox<InboxEmailDelivery>
  return { response: deliveries.length > 1 ? { ...first, deliveries } : first, deliveries, unknown }
}

/**
 * The Message-ID of the latest inbound email of a thread (from its `email:<Message-ID>` provider id), in angle
 * brackets, for the `In-Reply-To` and `References` of a reply. `null` when the thread has none (a contact form thread)
 * or it is not a header-safe id.
 */
export async function inboxLatestInboundMessageId(threadId: string): Promise<string | null> {
  const [row] = await db.select({ externalId: schema.inboxMessages.externalId }).from(schema.inboxMessages)
    .where(and(eq(schema.inboxMessages.threadId, threadId), eq(schema.inboxMessages.direction, 'in'), like(schema.inboxMessages.externalId, 'email:%')))
    .orderBy(desc(schema.inboxMessages.createdAtMs)).limit(1)
  const id = normaliseMessageId(row?.externalId?.slice('email:'.length))
  return id ? `<${id}>` : null
}
