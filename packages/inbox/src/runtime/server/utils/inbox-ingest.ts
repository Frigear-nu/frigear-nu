import type { H3Event } from 'h3'
import { db, schema } from '@nuxthub/db'
import { and, desc, eq, inArray } from 'drizzle-orm'
import { newInboxId } from '../../utils'
import type { InboxInboundMessage, InboxMessageDto, InboxThreadDto, InboxThreadStatus } from '../../../types'
import { toInboxMessageDto, toInboxThreadDto } from './inbox-dto'
import type { InboxChannelAccountRow, InboxContactRow, InboxThreadRow } from './inbox-dto'

export type InboxReceiveResult
  = | { status: 'received', thread: InboxThreadDto, message: InboxMessageDto }
    | { status: 'duplicate', messageId: string }
    | { status: 'ignored', reason: 'no_account' | 'disabled' }

/** Addresses are compared lower case for email (and the form slug), as stored. */
export function inboxNormaliseAddress(channel: string, address: string): string {
  const trimmed = address.trim()
  return channel === 'email' || channel === 'form' ? trimmed.toLowerCase() : trimmed
}

/** The enabled account of a channel at `address` (or with `accountId`). */
export async function inboxFindAccount(channel: string, ref: { accountId?: string, address?: string }): Promise<InboxChannelAccountRow | undefined> {
  if (ref.accountId) {
    const [row] = await db.select().from(schema.inboxChannelAccounts).where(and(eq(schema.inboxChannelAccounts.id, ref.accountId), eq(schema.inboxChannelAccounts.channel, channel))).limit(1)
    return row
  }
  if (!ref.address) return undefined
  const [row] = await db.select().from(schema.inboxChannelAccounts)
    .where(and(eq(schema.inboxChannelAccounts.channel, channel), eq(schema.inboxChannelAccounts.address, inboxNormaliseAddress(channel, ref.address)))).limit(1)
  return row
}

/** The message stored under this provider id, if any (webhook retries). */
async function existingMessageId(externalId: string): Promise<string | undefined> {
  const [row] = await db.select({ id: schema.inboxMessages.id }).from(schema.inboxMessages).where(eq(schema.inboxMessages.externalId, externalId)).limit(1)
  return row?.id
}

/** The contact behind a channel identity, created on first contact; a name or detail they did not have is filled in. */
async function upsertContact(channel: string, input: InboxInboundMessage['contact']): Promise<InboxContactRow> {
  const where = and(eq(schema.inboxContacts.channel, channel), eq(schema.inboxContacts.externalId, input.externalId))
  await db.insert(schema.inboxContacts).values({
    id: newInboxId('icn'),
    channel,
    externalId: input.externalId,
    name: input.name ?? null,
    email: input.email ?? null,
    phone: input.phone ?? null,
    userId: input.userId ?? null,
  }).onConflictDoNothing()
  const [row] = await db.select().from(schema.inboxContacts).where(where).limit(1)
  const changes: Partial<typeof schema.inboxContacts.$inferInsert> = {}
  if (input.name && input.name !== row!.name) changes.name = input.name
  if (input.email && !row!.email) changes.email = input.email
  if (input.phone && !row!.phone) changes.phone = input.phone
  if (input.userId && !row!.userId) changes.userId = input.userId
  if (!Object.keys(changes).length) return row!
  const [updated] = await db.update(schema.inboxContacts).set(changes).where(eq(schema.inboxContacts.id, row!.id)).returning()
  return updated!
}

/**
 * The thread a message belongs to: the one it names (same mailbox and contact), else the contact's latest thread in
 * the mailbox that is not closed, else a new one.
 */
async function threadFor(account: InboxChannelAccountRow, contact: InboxContactRow, inbound: InboxInboundMessage, now: Date): Promise<{ thread: InboxThreadRow, created: boolean }> {
  if (inbound.threadId) {
    const [named] = await db.select().from(schema.inboxThreads)
      .where(and(eq(schema.inboxThreads.id, inbound.threadId), eq(schema.inboxThreads.mailboxId, account.mailboxId), eq(schema.inboxThreads.contactId, contact.id))).limit(1)
    if (named) return { thread: named, created: false }
  }
  const [latest] = await db.select().from(schema.inboxThreads)
    .where(and(eq(schema.inboxThreads.mailboxId, account.mailboxId), eq(schema.inboxThreads.contactId, contact.id), eq(schema.inboxThreads.channel, account.channel), inArray(schema.inboxThreads.status, ['open', 'pending'])))
    .orderBy(desc(schema.inboxThreads.lastMessageAt)).limit(1)
  if (latest) return { thread: latest, created: false }
  const [created] = await db.insert(schema.inboxThreads).values({
    id: newInboxId('ibt'),
    mailboxId: account.mailboxId,
    contactId: contact.id,
    channelAccountId: account.id,
    channel: account.channel,
    subject: inbound.subject?.slice(0, 500) || null,
    status: 'open',
    lastMessageAt: now,
  }).returning()
  return { thread: created!, created: true }
}

/**
 * Stores an inbound message of `channel`: finds the account, the contact and the thread, stores the message once per
 * provider id, reopens a closed or pending thread and fires `inbox:message:received` (and
 * `inbox:thread:status-changed` when the status moved). A message delivered twice answers `duplicate`; one for an
 * address no enabled account has answers `ignored`, so a provider stops retrying either.
 */
export async function inboxReceive(event: H3Event, channel: string, inbound: InboxInboundMessage, account?: InboxChannelAccountRow): Promise<InboxReceiveResult> {
  const target = account ?? await inboxFindAccount(channel, { accountId: inbound.accountId, address: inbound.address })
  if (!target) return { status: 'ignored', reason: 'no_account' }
  if (!target.enabled) return { status: 'ignored', reason: 'disabled' }
  const externalId = `${channel}:${inbound.externalId}`
  const known = await existingMessageId(externalId)
  if (known) return { status: 'duplicate', messageId: known }

  const now = new Date()
  const contact = await upsertContact(channel, inbound.contact)
  const { thread } = await threadFor(target, contact, inbound, now)

  const [message] = await db.insert(schema.inboxMessages).values({
    id: newInboxId('ibm'),
    threadId: thread.id,
    direction: 'in',
    body: inbound.body,
    attachments: inbound.attachments ?? [],
    externalId,
    createdAt: now,
    createdAtMs: now.getTime(),
  }).onConflictDoNothing().returning()
  // Another delivery of the same message won the race.
  if (!message) return { status: 'duplicate', messageId: (await existingMessageId(externalId)) ?? '' }

  const from = thread.status as InboxThreadStatus
  const to: InboxThreadStatus = 'open'
  const [updated] = await db.update(schema.inboxThreads)
    .set({ lastMessageAt: now, status: to, ...(!thread.subject && inbound.subject ? { subject: inbound.subject.slice(0, 500) } : {}) })
    .where(eq(schema.inboxThreads.id, thread.id)).returning()
  const threadDto = toInboxThreadDto(updated!)
  const messageDto = toInboxMessageDto(message)
  const hooks = useNitroApp().hooks
  if (from !== to) await hooks.callHook('inbox:thread:status-changed', { event, thread: threadDto, from, to })
  await hooks.callHook('inbox:message:received', { event, thread: threadDto, message: messageDto })
  return { status: 'received', thread: threadDto, message: messageDto }
}

/** Stores a batch of inbound messages one by one; a failure of one is logged and counted, the others still go in. */
export async function inboxReceiveAll(event: H3Event, channel: string, messages: InboxInboundMessage[]): Promise<{ received: number, duplicates: number, ignored: number, failed: number }> {
  const counts = { received: 0, duplicates: 0, ignored: 0, failed: 0 }
  for (const message of messages) {
    try {
      const result = await inboxReceive(event, channel, message)
      if (result.status === 'received') counts.received++
      else if (result.status === 'duplicate') counts.duplicates++
      else counts.ignored++
    }
    catch (error) {
      counts.failed++
      console.error(`[inbox] could not store a ${channel} message`, error)
    }
  }
  return counts
}
